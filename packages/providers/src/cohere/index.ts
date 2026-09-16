import type { Runtime } from "weftai";
import { type BoundTool, parseToolArguments, requireCapability } from "weftai/adapter";
import { bindProviderTools, type ProviderToolsOptions } from "../bind.js";

export interface CohereFunctionTool {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
  handle(input: unknown): Promise<string>;
}

export interface CohereToolCall {
  readonly id: string;
  readonly type?: string | undefined;
  readonly function: { readonly name: string; readonly arguments: unknown };
}

export interface CohereToolResult {
  readonly role: "tool";
  readonly tool_call_id: string;
  readonly content: readonly [
    { readonly type: "document"; readonly document: { readonly data: { readonly text: string } } },
  ];
}

export function toCohereTools(bound: readonly BoundTool[]): CohereFunctionTool[] {
  return bound.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
    },
    handle: (input) => tool.handle(input),
  }));
}

export interface CohereToolsOptions<Ctx> extends ProviderToolsOptions<Ctx> {
  readonly model?: string | undefined;
}

export function cohereTools<Ctx>(
  runtime: Runtime<Ctx>,
  options: CohereToolsOptions<Ctx>,
): CohereFunctionTool[] {
  if (options.model !== undefined) {
    requireCapability(options.model, { provider: "cohere", api: "cohere.chat" });
  }
  return toCohereTools(
    bindProviderTools(runtime, {
      ...options,
      dialect: options.dialect ?? "union",
    }),
  );
}

export async function handleCohereToolCalls(
  tools: readonly CohereFunctionTool[],
  calls: readonly CohereToolCall[],
): Promise<CohereToolResult[]> {
  const results: CohereToolResult[] = [];
  for (const call of calls) {
    const tool = tools.find((candidate) => candidate.function.name === call.function.name);
    const parsed = parseToolArguments(call.function.arguments);
    const text =
      tool === undefined
        ? `Unknown tool '${call.function.name}'. Available tools: ${tools.map((item) => item.function.name).join(", ") || "(none)"}.`
        : parsed.ok
          ? await tool.handle(parsed.value)
          : parsed.message;
    results.push({
      role: "tool",
      tool_call_id: call.id,
      content: [{ type: "document", document: { data: { text } } }],
    });
  }
  return results;
}
