import type { BoundTool } from "weftai/adapter";
import { parseToolArguments } from "weftai/adapter";

export interface ChatCompletionsFunctionTool {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
  readonly strict?: boolean;
  handle(input: unknown): Promise<string>;
}

export interface ChatCompletionsToolCall {
  readonly id: string;
  readonly type?: string | undefined;
  readonly function: { readonly name: string; readonly arguments: string | object };
}

export interface ChatCompletionsToolMessage {
  readonly role: "tool";
  readonly tool_call_id: string;
  readonly content: string;
}

export function toChatCompletionsTools(
  bound: readonly BoundTool[],
  options: { readonly strict?: boolean | undefined } = {},
): ChatCompletionsFunctionTool[] {
  return bound.map((tool) => {
    const definition: ChatCompletionsFunctionTool = {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.schema,
      },
      handle: (input) => tool.handle(input),
    };
    return options.strict === true ? { ...definition, strict: true } : definition;
  });
}

/** Deprecated OpenAI `functions` array still served by some Azure and compat hosts. */
export function toLegacyFunctions(bound: readonly BoundTool[]): {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  handle(input: unknown): Promise<string>;
}[] {
  return bound.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.schema,
    handle: (input) => tool.handle(input),
  }));
}

export async function handleChatCompletionsToolCalls(
  tools: readonly ChatCompletionsFunctionTool[],
  calls: readonly ChatCompletionsToolCall[],
): Promise<ChatCompletionsToolMessage[]> {
  const results: ChatCompletionsToolMessage[] = [];
  for (const call of calls) {
    const tool = tools.find((candidate) => candidate.function.name === call.function.name);
    if (tool === undefined) {
      results.push({
        role: "tool",
        tool_call_id: call.id,
        content: `Unknown tool '${call.function.name}'. Available tools: ${tools.map((item) => item.function.name).join(", ") || "(none)"}.`,
      });
      continue;
    }
    const parsed = parseToolArguments(call.function.arguments);
    const content = parsed.ok ? await tool.handle(parsed.value) : parsed.message;
    results.push({ role: "tool", tool_call_id: call.id, content });
  }
  return results;
}

export async function handleLegacyFunctionCall(
  functions: ReturnType<typeof toLegacyFunctions>,
  call: { readonly name: string; readonly arguments: string | object },
): Promise<{ readonly role: "function"; readonly name: string; readonly content: string }> {
  const fn = functions.find((item) => item.name === call.name);
  if (fn === undefined) {
    return {
      role: "function",
      name: call.name,
      content: `Unknown function '${call.name}'.`,
    };
  }
  const parsed = parseToolArguments(call.arguments);
  return {
    role: "function",
    name: call.name,
    content: parsed.ok ? await fn.handle(parsed.value) : parsed.message,
  };
}
