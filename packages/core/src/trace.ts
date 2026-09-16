import type { PlanIssue } from "./errors.js";
import { type StepResult, TRACE_VERSION, type Trace } from "./executor/types.js";
import type { ValidatedPlan, ValidatedStep } from "./plan/validate.js";
import { formatRef } from "./refs/syntax.js";
import { setAtPath } from "./schema/walk.js";

export type { Trace, TraceInputRef, TraceStep } from "./executor/types.js";
export { TRACE_VERSION } from "./executor/types.js";

export function buildTrace<Ctx>(args: {
  readonly ok: boolean;
  readonly durationMs: number;
  readonly steps: readonly StepResult[];
  readonly validated: ValidatedPlan<Ctx> | undefined;
  readonly issues: readonly PlanIssue[] | undefined;
}): Trace {
  const byId = new Map(args.steps.map((step) => [step.id, step]));
  const validatedById = new Map((args.validated?.steps ?? []).map((step) => [step.id, step]));
  return {
    version: TRACE_VERSION,
    ok: args.ok,
    durationMs: args.durationMs,
    steps: args.steps.map((step) => {
      const validated = validatedById.get(step.id);
      return {
        id: step.id,
        operation: step.operation,
        status: step.status,
        dependencies: validated?.dependencies ?? [],
        input: validated === undefined ? undefined : tracedInput(validated, byId),
        output:
          step.status === "ok"
            ? { kind: step.kind, type: step.type, count: step.count }
            : undefined,
        notices: step.notices,
        error: step.error,
        skippedBecause: step.skippedBecause,
        startedAt: step.startedAt,
        durationMs: step.durationMs,
      };
    }),
    issues: args.issues,
  };
}

function tracedInput<Ctx>(
  step: ValidatedStep<Ctx>,
  results: ReadonlyMap<string, StepResult>,
): unknown {
  let input = step.input;
  for (const ref of step.refs) {
    const target = results.get(ref.ref.id);
    input = setAtPath(input, ref.site.path, {
      ref: formatRef(ref.ref),
      count: target?.count,
    });
  }
  return input;
}
