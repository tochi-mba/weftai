import type { BoundTool } from "weftai/adapter";
import { toChatCompletionsTools } from "./chat.js";

/** Assistants API tools use the Chat Completions nested function shape. */
export function toAssistantsTools(bound: readonly BoundTool[]) {
  return toChatCompletionsTools(bound);
}

export interface RealtimeFunctionTool {
  readonly type: "function";
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  handle(input: unknown): Promise<string>;
}

export function toRealtimeTools(bound: readonly BoundTool[]): RealtimeFunctionTool[] {
  return bound.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.schema,
    handle: (input) => tool.handle(input),
  }));
}

export function realtimeFunctionCallOutput(
  callId: string,
  output: string,
): {
  readonly type: "function_call_output";
  readonly call_id: string;
  readonly output: string;
} {
  return { type: "function_call_output", call_id: callId, output };
}
