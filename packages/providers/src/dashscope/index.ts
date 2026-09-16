import type { Runtime } from "weftai";
import { type BoundTool, parseToolArguments, requireCapability } from "weftai/adapter";
import { bindProviderTools, type ProviderToolsOptions } from "../bind.js";

export type DashScopeNativeKind = "generation" | "multimodal";

export interface DashScopeNativeTool {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
  handle(input: unknown): Promise<string>;
}

export interface DashScopeToolCall {
  readonly function: { readonly name: string; readonly arguments: unknown };
}

export interface DashScopeToolMessage {
  readonly role: "tool";
  readonly name: string;
  readonly content: string;
}

export function dashscopeNativeKind(model: string): DashScopeNativeKind {
  return /^qwen3\.8/i.test(model) ? "multimodal" : "generation";
}

export function toDashScopeNativeTools(bound: readonly BoundTool[]): DashScopeNativeTool[] {
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

export interface DashScopeToolsOptions<Ctx> extends ProviderToolsOptions<Ctx> {
  readonly model?: string | undefined;
  readonly region?: "cn" | "intl" | undefined;
  readonly extraBody?: Readonly<Record<string, unknown>> | undefined;
}

export function dashscopeTools<Ctx>(
  runtime: Runtime<Ctx>,
  options: DashScopeToolsOptions<Ctx>,
): DashScopeNativeTool[] {
  if (options.model !== undefined) {
    requireCapability(options.model, {
      provider: "dashscope",
      api: "dashscope.native",
      region: options.region,
    });
  }
  return toDashScopeNativeTools(
    bindProviderTools(runtime, {
      ...options,
      dialect: options.dialect ?? "union",
    }),
  );
}

export function dashscopeNativeRequest(options: {
  readonly model: string;
  readonly messages: readonly unknown[];
  readonly tools: readonly DashScopeNativeTool[];
  readonly extraBody?: Readonly<Record<string, unknown>> | undefined;
}): {
  readonly kind: DashScopeNativeKind;
  readonly model: string;
  readonly input: { readonly messages: readonly unknown[] };
  readonly parameters: Record<string, unknown>;
} {
  const tools = options.tools.map(({ handle: _handle, ...definition }) => definition);
  return {
    kind: dashscopeNativeKind(options.model),
    model: options.model,
    input: { messages: options.messages },
    parameters: {
      result_format: "message",
      tools,
      ...options.extraBody,
    },
  };
}

export async function handleDashScopeToolCalls(
  tools: readonly DashScopeNativeTool[],
  calls: readonly DashScopeToolCall[],
): Promise<DashScopeToolMessage[]> {
  const results: DashScopeToolMessage[] = [];
  for (const call of calls) {
    const tool = tools.find((candidate) => candidate.function.name === call.function.name);
    const parsed = parseToolArguments(call.function.arguments);
    const content =
      tool === undefined
        ? `Unknown tool '${call.function.name}'. Available tools: ${tools.map((item) => item.function.name).join(", ") || "(none)"}.`
        : parsed.ok
          ? await tool.handle(parsed.value)
          : parsed.message;
    results.push({ role: "tool", name: call.function.name, content });
  }
  return results;
}
