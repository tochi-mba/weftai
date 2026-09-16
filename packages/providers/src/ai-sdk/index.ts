import type { Runtime } from "weftai";
import type { BoundTool } from "weftai/adapter";
import { bindProviderTools, type ProviderToolsOptions } from "../bind.js";

export interface AiSdkTool {
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  execute(input: unknown): Promise<string>;
}

export function toAiSdkTools(bound: readonly BoundTool[]): AiSdkTool[] {
  return bound.map((tool) => ({
    description: tool.description,
    inputSchema: tool.schema,
    execute: (input: unknown) => tool.handle(input),
  }));
}

export function wrapAiSdkTools<T>(tools: readonly AiSdkTool[], tool: (spec: AiSdkTool) => T): T[] {
  return tools.map((spec) => tool(spec));
}

export function aiSdkTools<Ctx>(
  runtime: Runtime<Ctx>,
  options: ProviderToolsOptions<Ctx>,
): AiSdkTool[] {
  return toAiSdkTools(
    bindProviderTools(runtime, {
      ...options,
      dialect: options.dialect ?? "union",
    }),
  );
}
