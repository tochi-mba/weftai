import { randomUUID } from "node:crypto";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { type AnyOperation, PlanSchema, type Runtime } from "weftai";
import { bindTool } from "weftai/adapter";

export interface ToolSpec<Ctx> {
  readonly name: string;
  readonly description?: string | undefined;
  readonly include?: ((operation: AnyOperation<Ctx>) => boolean) | undefined;
  readonly strict?: boolean | undefined;
  readonly eagerInputStreaming?: boolean | undefined;
  readonly allowWrites?: boolean | undefined;
}

export interface WeftaiToolsOptions<Ctx> {
  readonly ctx: Ctx | (() => Ctx | Promise<Ctx>);
  readonly tools: readonly ToolSpec<Ctx>[];
  readonly session?: { readonly id: string } | undefined;
}

type PlanRunnable = ReturnType<typeof betaZodTool<typeof PlanSchema>>;

/**
 * A runnable Claude tool (accepted by `client.beta.messages.toolRunner`) whose input is a plan.
 */
export type WeftaiTool = PlanRunnable & {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Record<string, unknown>;
  readonly strict: boolean;
  readonly eager_input_streaming?: true;
  handle(input: unknown): Promise<string>;
};

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Record<string, unknown>;
  readonly strict: boolean;
  readonly eager_input_streaming?: true;
  handle(input: unknown): Promise<string>;
}

/**
 * Claude tools backed by a Weftai runtime. Each spec becomes one tool; results stay in the
 * session store so a later tool call can `$ref` an earlier result by name.
 */
export function weftaiTools<Ctx>(
  runtime: Runtime<Ctx>,
  options: WeftaiToolsOptions<Ctx>,
): WeftaiTool[] {
  const sessionId = options.session?.id ?? randomUUID();
  return options.tools.map((spec) => makeTool(runtime, spec, options.ctx, sessionId));
}

/** Tool definition for a manual tool-use loop. Never sets `tool_choice`. */
export function toToolDefinition<Ctx>(
  runtime: Runtime<Ctx>,
  spec: ToolSpec<Ctx>,
  options: {
    readonly ctx: Ctx | (() => Ctx | Promise<Ctx>);
    readonly session?: { readonly id: string } | undefined;
  },
): ToolDefinition {
  const tool = makeTool(runtime, spec, options.ctx, options.session?.id ?? randomUUID());
  const definition: ToolDefinition = {
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema,
    strict: tool.strict,
    handle: (input) => tool.handle(input),
  };
  return tool.eager_input_streaming === true
    ? { ...definition, eager_input_streaming: true }
    : definition;
}

function makeTool<Ctx>(
  runtime: Runtime<Ctx>,
  spec: ToolSpec<Ctx>,
  ctx: Ctx | (() => Ctx | Promise<Ctx>),
  sessionId: string,
): WeftaiTool {
  const bound = bindTool(
    runtime,
    {
      name: spec.name,
      description: spec.description,
      include: spec.include,
      allowWrites: spec.allowWrites,
      dialect: "anthropic",
      strict: spec.strict !== false,
      onInvalid: "text",
    },
    { ctx, sessionId },
  );
  const runnable = betaZodTool({
    name: bound.name,
    description: bound.description,
    inputSchema: PlanSchema,
    run: async (input) => bound.handle(input),
  });

  const tool = {
    ...runnable,
    name: bound.name,
    description: bound.description,
    input_schema: bound.schema,
    strict: spec.strict !== false,
    handle: (input: unknown) => bound.handle(input),
  } as WeftaiTool;
  return spec.eagerInputStreaming === true ? { ...tool, eager_input_streaming: true } : tool;
}
