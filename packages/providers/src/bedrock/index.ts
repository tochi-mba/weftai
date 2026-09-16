import type { Runtime } from "weftai";
import { type BoundTool, parseToolArguments, requireCapability } from "weftai/adapter";
import { bindProviderTools, type ProviderToolsOptions } from "../bind.js";

export interface ConverseToolSpec {
  readonly toolSpec: {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: { readonly json: Record<string, unknown> };
    readonly strict?: boolean;
  };
  handle(input: unknown): Promise<string>;
}

export interface ConverseToolConfig {
  readonly tools: readonly ConverseToolSpec[];
}

export interface BedrockToolUse {
  readonly toolUseId: string;
  readonly name: string;
  readonly input: unknown;
}

export interface BedrockToolResult {
  readonly toolUseId: string;
  readonly content: readonly [{ readonly text: string }];
  readonly status: "success" | "error";
}

export function toConverseToolConfig(
  bound: readonly BoundTool[],
  options: { readonly strict?: boolean | undefined } = {},
): ConverseToolConfig {
  return {
    tools: bound.map((tool) => {
      const spec: ConverseToolSpec = {
        toolSpec: {
          name: tool.name,
          description: tool.description,
          inputSchema: { json: tool.schema },
        },
        handle: (input) => tool.handle(input),
      };
      return options.strict === true
        ? { ...spec, toolSpec: { ...spec.toolSpec, strict: true } }
        : spec;
    }),
  };
}

export interface BedrockToolsOptions<Ctx> extends ProviderToolsOptions<Ctx> {
  readonly model?: string | undefined;
}

export function bedrockTools<Ctx>(
  runtime: Runtime<Ctx>,
  options: BedrockToolsOptions<Ctx>,
): ConverseToolConfig {
  if (options.model !== undefined) {
    requireCapability(options.model, {
      provider: "bedrock",
      api: "bedrock.converse",
    });
  }
  const nova = options.model !== undefined && /nova/i.test(options.model);
  const bound = bindProviderTools(runtime, {
    ...options,
    dialect: options.dialect ?? (nova ? "bedrock-nova" : "union"),
    strict: options.strict ?? true,
  });
  return toConverseToolConfig(bound, { strict: options.strict });
}

export async function handleBedrockToolUses(
  config: ConverseToolConfig,
  uses: readonly BedrockToolUse[],
): Promise<readonly { readonly toolResult: BedrockToolResult }[]> {
  const results: { readonly toolResult: BedrockToolResult }[] = [];
  for (const use of uses) {
    const tool = config.tools.find((candidate) => candidate.toolSpec.name === use.name);
    if (tool === undefined) {
      results.push({
        toolResult: {
          toolUseId: use.toolUseId,
          content: [
            {
              text: `Unknown tool '${use.name}'. Available tools: ${config.tools.map((item) => item.toolSpec.name).join(", ") || "(none)"}.`,
            },
          ],
          status: "error",
        },
      });
      continue;
    }
    const parsed = parseToolArguments(use.input);
    const text = parsed.ok ? await tool.handle(parsed.value) : parsed.message;
    results.push({
      toolResult: {
        toolUseId: use.toolUseId,
        content: [{ text }],
        status: parsed.ok ? "success" : "error",
      },
    });
  }
  return results;
}
