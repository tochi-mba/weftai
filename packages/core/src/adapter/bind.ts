import type { Runtime } from "../executor/runtime.js";
import { PlanSchema } from "../plan/types.js";
import { compilePlanSchema } from "./dialects.js";
import type { BindContext, BindToolSpec, BoundHandleResult, BoundTool } from "./types.js";

export async function resolveCtx<Ctx>(ctx: Ctx | (() => Ctx | Promise<Ctx>)): Promise<Ctx> {
  return typeof ctx === "function" ? await (ctx as () => Ctx | Promise<Ctx>)() : ctx;
}

/**
 * Bind one Weftai tool: a name, a compiled plan schema, and a handle that executes a plan and
 * returns the model-facing text. Provider packages only map this JSON into their wire format.
 */
export function bindTool<Ctx>(
  runtime: Runtime<Ctx>,
  spec: BindToolSpec<Ctx>,
  context: BindContext<Ctx>,
): BoundTool {
  const scoped = runtime.registry.filter(spec.include ?? (() => true));
  const allowWrites =
    spec.allowWrites ?? scoped.operations.some((operation) => operation.effects === "write");
  const dialect = spec.dialect ?? "union";
  const schema = compilePlanSchema(scoped.operations as never, dialect, {
    strict: spec.strict,
  });
  const description = spec.description ?? scoped.describe();
  const onInvalid = spec.onInvalid ?? "text";

  const execute = async (input: unknown): Promise<BoundHandleResult> => {
    const parsed = PlanSchema.safeParse(input);
    if (!parsed.success) {
      const text = formatInvalidPlan(parsed.error.issues);
      if (onInvalid === "throw") {
        throw parsed.error;
      }
      return { text, ok: false };
    }
    const result = await runtime.execute(parsed.data, {
      ctx: await resolveCtx(context.ctx),
      session: { id: context.sessionId },
      allowWrites,
      include: spec.include,
    });
    return { text: result.text, ok: result.ok };
  };

  return {
    name: spec.name,
    description,
    schema,
    dialect,
    execute,
    handle: async (input) => (await execute(input)).text,
  };
}

export function formatInvalidPlan(
  issues: readonly { path: readonly (string | number | symbol)[]; message: string }[],
): string {
  if (issues.length === 0) return "Could not read this plan: the value is not a plan.";
  const lines = issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    const where = path.length === 0 ? "the plan" : `'${path}'`;
    return `${where}: ${issue.message}`;
  });
  return `Could not read this plan. ${lines.join(" ")}`;
}

/**
 * Parse tool-call arguments that arrive as a JSON string (OpenAI) or an object (Ollama, Gemini).
 */
export function parseToolArguments(
  raw: unknown,
):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string } {
  if (raw === undefined || raw === null) return { ok: true, value: {} };
  if (typeof raw === "object") return { ok: true, value: raw };
  if (typeof raw === "number" || typeof raw === "boolean") {
    return {
      ok: false,
      message: `Tool arguments must be a JSON object or a JSON string, not ${typeof raw}.`,
    };
  }
  if (typeof raw !== "string") {
    return {
      ok: false,
      message: `Tool arguments must be a JSON object or a JSON string, not ${typeof raw}.`,
    };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch {
    return {
      ok: false,
      message: `Tool arguments are not valid JSON: ${trimmed.slice(0, 80)}.`,
    };
  }
}
