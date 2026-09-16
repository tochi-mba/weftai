import type { Runtime } from "weftai";
import { type BoundTool, parseToolArguments, requireCapability } from "weftai/adapter";
import { bindProviderTools, type ProviderToolsOptions } from "../bind.js";

export interface OllamaFunctionTool {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
  handle(input: unknown): Promise<string>;
}

export interface OllamaToolCall {
  readonly function: { readonly name: string; readonly arguments: unknown };
}

export interface OllamaToolMessage {
  readonly role: "tool";
  readonly tool_name: string;
  readonly content: string;
}

export interface OllamaStreamPart {
  readonly thinking: string;
  readonly content: string;
  readonly toolCalls: readonly OllamaToolCall[];
  readonly done: boolean;
}

export function toOllamaTools(bound: readonly BoundTool[]): OllamaFunctionTool[] {
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

export interface OllamaToolsOptions<Ctx> extends ProviderToolsOptions<Ctx> {
  readonly model?: string | undefined;
  readonly stream?: boolean | undefined;
}

export function ollamaTools<Ctx>(
  runtime: Runtime<Ctx>,
  options: OllamaToolsOptions<Ctx>,
): OllamaFunctionTool[] {
  if (options.model !== undefined) {
    requireCapability(options.model, {
      provider: "ollama",
      api: "ollama.chat",
      stream: options.stream,
    });
  }
  return toOllamaTools(
    bindProviderTools(runtime, {
      ...options,
      dialect: options.dialect ?? "union",
    }),
  );
}

export async function handleOllamaToolCalls(
  tools: readonly OllamaFunctionTool[],
  calls: readonly OllamaToolCall[],
): Promise<OllamaToolMessage[]> {
  const results: OllamaToolMessage[] = [];
  for (const call of calls) {
    const tool = tools.find((candidate) => candidate.function.name === call.function.name);
    if (tool === undefined) {
      results.push({
        role: "tool",
        tool_name: call.function.name,
        content: `Unknown tool '${call.function.name}'. Available tools: ${tools.map((item) => item.function.name).join(", ") || "(none)"}.`,
      });
      continue;
    }
    const parsed = parseToolArguments(call.function.arguments);
    results.push({
      role: "tool",
      tool_name: call.function.name,
      content: parsed.ok ? await tool.handle(parsed.value) : parsed.message,
    });
  }
  return results;
}

export function parseOllamaChatPayload(payload: unknown): OllamaStreamPart {
  const record =
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const message =
    typeof record.message === "object" && record.message !== null
      ? (record.message as Record<string, unknown>)
      : record;
  const thinking = typeof message.thinking === "string" ? message.thinking : "";
  const content = typeof message.content === "string" ? message.content : "";
  const rawCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls
    : Array.isArray(record.tool_calls)
      ? record.tool_calls
      : [];
  const toolCalls: OllamaToolCall[] = [];
  for (const item of rawCalls) {
    if (typeof item !== "object" || item === null) continue;
    const fn = (item as { function?: { name?: unknown; arguments?: unknown } }).function;
    if (fn === undefined || typeof fn.name !== "string") continue;
    toolCalls.push({ function: { name: fn.name, arguments: fn.arguments } });
  }
  return { thinking, content, toolCalls, done: record.done === true };
}

export function assembleOllamaStream(chunks: readonly unknown[]): {
  readonly thinking: string;
  readonly content: string;
  readonly toolCalls: readonly OllamaToolCall[];
} {
  let thinking = "";
  let content = "";
  const toolCalls: OllamaToolCall[] = [];
  for (const chunk of chunks) {
    const part = parseOllamaChatPayload(chunk);
    thinking += part.thinking;
    content += part.content;
    toolCalls.push(...part.toolCalls);
  }
  return { thinking, content, toolCalls };
}
