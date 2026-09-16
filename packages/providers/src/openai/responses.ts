import type { BoundTool } from "weftai/adapter";
import { parseToolArguments } from "weftai/adapter";

export interface ResponsesFunctionTool {
  readonly type: "function";
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly strict: boolean;
  handle(input: unknown): Promise<string>;
}

export interface ResponsesFunctionCall {
  readonly type?: string | undefined;
  readonly call_id: string;
  readonly name: string;
  readonly arguments: string | object;
}

export interface ResponsesFunctionCallOutput {
  readonly type: "function_call_output";
  readonly call_id: string;
  readonly output: string;
}

export function toResponsesTools(
  bound: readonly BoundTool[],
  options: { readonly strict?: boolean | undefined } = {},
): ResponsesFunctionTool[] {
  const strict = options.strict !== false;
  return bound.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.schema,
    strict,
    handle: (input) => tool.handle(input),
  }));
}

export async function handleResponsesFunctionCalls(
  tools: readonly ResponsesFunctionTool[],
  calls: readonly ResponsesFunctionCall[],
): Promise<ResponsesFunctionCallOutput[]> {
  const results: ResponsesFunctionCallOutput[] = [];
  for (const call of calls) {
    const tool = tools.find((candidate) => candidate.name === call.name);
    if (tool === undefined) {
      results.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: `Unknown tool '${call.name}'. Available tools: ${tools.map((item) => item.name).join(", ") || "(none)"}.`,
      });
      continue;
    }
    const parsed = parseToolArguments(call.arguments);
    results.push({
      type: "function_call_output",
      call_id: call.call_id,
      output: parsed.ok ? await tool.handle(parsed.value) : parsed.message,
    });
  }
  return results;
}
