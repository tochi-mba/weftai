import type { Runtime } from "weftai";
import type { BoundTool } from "weftai/adapter";
import { bindProviderTools, type ProviderToolsOptions } from "../bind.js";

export interface AnthropicToolResult {
  readonly type: "tool_result";
  readonly tool_use_id: string;
  readonly content: string;
  readonly is_error: boolean;
}

export interface MessagesTool {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Record<string, unknown>;
  handle(input: unknown): Promise<string>;
  toToolResult(toolUseId: string, input: unknown): Promise<AnthropicToolResult>;
}

export interface AnthropicToolUse {
  readonly type?: string | undefined;
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

export function toMessagesTools(bound: readonly BoundTool[]): MessagesTool[] {
  return bound.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.schema,
    handle: (input: unknown) => tool.handle(input),
    async toToolResult(toolUseId: string, input: unknown): Promise<AnthropicToolResult> {
      const result = await tool.execute(input);
      return {
        type: "tool_result",
        tool_use_id: toolUseId,
        content: result.text,
        is_error: !result.ok,
      };
    },
  }));
}

/** Messages API tools (`input_schema`, `tool_use` / `tool_result`). Never sets `tool_choice`. */
export function anthropicTools<Ctx>(
  runtime: Runtime<Ctx>,
  options: ProviderToolsOptions<Ctx>,
): MessagesTool[] {
  return toMessagesTools(
    bindProviderTools(runtime, {
      ...options,
      dialect: options.dialect ?? "anthropic",
      strict: options.strict !== false,
    }),
  );
}

export async function handleToolUseBlocks(
  tools: readonly MessagesTool[],
  blocks: readonly AnthropicToolUse[],
): Promise<AnthropicToolResult[]> {
  const results: AnthropicToolResult[] = [];
  for (const block of blocks) {
    const tool = tools.find((candidate) => candidate.name === block.name);
    if (tool === undefined) {
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: `Unknown tool '${block.name}'. Available tools: ${tools.map((item) => item.name).join(", ") || "(none)"}.`,
        is_error: true,
      });
      continue;
    }
    results.push(await tool.toToolResult(block.id, block.input));
  }
  return results;
}
