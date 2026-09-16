import { randomUUID } from "node:crypto";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { type AnyOperation, PlanSchema, type Registry, type Runtime } from "agentweft";

export interface ToolSpec<Ctx> {
  readonly name: string;
  /** Defaults to the scoped registry's `describe()` output. */
  readonly description?: string | undefined;
  /** Which operations this tool exposes. Defaults to every operation in the runtime. */
  readonly include?: ((operation: AnyOperation<Ctx>) => boolean) | undefined;
  /** Defaults to true: the plan schema is closed so grammar-constrained sampling can be used. */
  readonly strict?: boolean | undefined;
  /** Opt in to streaming tool input as it is generated (`eager_input_streaming`). */
  readonly eagerInputStreaming?: boolean | undefined;
  /** Defaults to whether the scoped registry contains any `write` operation. */
  readonly allowWrites?: boolean | undefined;
}

export interface AgentweftToolsOptions<Ctx> {
  readonly ctx: Ctx | (() => Ctx | Promise<Ctx>);
  readonly tools: readonly ToolSpec<Ctx>[];
  /** Shared by every tool from this call so a later tool call can `$ref` an earlier result. */
  readonly session?: { readonly id: string } | undefined;
}

type PlanRunnable = ReturnType<typeof betaZodTool<typeof PlanSchema>>;

/**
 * A runnable Claude tool (accepted by `client.beta.messages.toolRunner`) whose input is a plan.
 * `handle` runs raw JSON input for manual tool-use loops and returns the model-facing text.
 */
export type AgentweftTool = PlanRunnable & {
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
 * Claude tools backed by an Agentweft runtime. Each spec becomes one tool; results stay in the
 * session store so a later tool call can reference an earlier one by name.
 */
export function agentweftTools<Ctx>(
  runtime: Runtime<Ctx>,
  options: AgentweftToolsOptions<Ctx>,
): AgentweftTool[] {
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
): AgentweftTool {
  const scoped: Registry<Ctx> = runtime.registry.filter(spec.include ?? (() => true));
  const allowWrites =
    spec.allowWrites ?? scoped.operations.some((operation) => operation.effects === "write");
  const strict = spec.strict !== false;
  const runnable = betaZodTool({
    name: spec.name,
    description: spec.description ?? scoped.describe(),
    inputSchema: PlanSchema,
    run: async (input) => {
      const result = await runtime.execute(input, {
        ctx: await resolveCtx(ctx),
        session: { id: sessionId },
        allowWrites,
      });
      return result.text;
    },
  });

  const handle = async (input: unknown): Promise<string> => {
    const out = await runnable.run(runnable.parse(input));
    return typeof out === "string" ? out : JSON.stringify(out);
  };

  const tool = {
    ...runnable,
    name: spec.name,
    description: spec.description ?? scoped.describe(),
    // The Zod-derived schema is loose; replace it with one variant per operation.
    input_schema: scoped.planSchema({ style: "union", strict }),
    strict,
    handle,
  } as AgentweftTool;
  return spec.eagerInputStreaming === true ? { ...tool, eager_input_streaming: true } : tool;
}

async function resolveCtx<Ctx>(ctx: Ctx | (() => Ctx | Promise<Ctx>)): Promise<Ctx> {
  return typeof ctx === "function" ? await (ctx as () => Ctx | Promise<Ctx>)() : ctx;
}
