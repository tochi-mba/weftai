import {
  AgentweftError,
  LimitExceededError,
  RefResolutionError,
  StepExecutionError,
} from "../errors.js";
import type { Formatter } from "../format/formatter.js";
import { createFormatter } from "../format/formatter.js";
import type { Presentation, RunContext } from "../operation.js";
import type { ValidatedPlan, ValidatedStep } from "../plan/validate.js";
import { validatePlan } from "../plan/validate.js";
import { resolveRef } from "../results/resolve.js";
import { sessionView } from "../results/session.js";
import { createMemoryStore } from "../results/store.js";
import { DEFAULT_SESSION_ID, type StoredResult } from "../results/types.js";
import { formatPath, setAtPath } from "../schema/walk.js";
import { buildTrace } from "../trace.js";
import { normalizeOutput } from "./normalize.js";
import { mapPool } from "./pool.js";
import {
  bindTimeout,
  mergeAbort,
  planTimeoutError,
  stepTimeoutError,
  whenAborted,
} from "./signals.js";
import {
  DEFAULT_LIMITS,
  type ExecutionResult,
  type Runtime,
  type RuntimeHooks,
  type RuntimeOptions,
  type StepResult,
} from "./types.js";

export type {
  ExecuteOptions,
  ExecutionResult,
  FailurePolicy,
  Runtime,
  RuntimeHooks,
  RuntimeLimits,
  RuntimeOptions,
  StepHookInfo,
  StepResult,
  StepStatus,
  Trace,
  TraceInputRef,
  TraceStep,
} from "./types.js";
export { DEFAULT_LIMITS, TRACE_VERSION } from "./types.js";

export function createRuntime<Ctx>(options: RuntimeOptions<Ctx>): Runtime<Ctx> {
  const registry = options.registry;
  const store = options.store ?? createMemoryStore();
  const limits = {
    maxSteps: options.limits?.maxSteps ?? DEFAULT_LIMITS.maxSteps,
    stepTimeoutMs: options.limits?.stepTimeoutMs ?? DEFAULT_LIMITS.stepTimeoutMs,
    planTimeoutMs: options.limits?.planTimeoutMs ?? DEFAULT_LIMITS.planTimeoutMs,
    maxParallel: options.limits?.maxParallel ?? DEFAULT_LIMITS.maxParallel,
  };
  const hooks = options.hooks ?? {};
  const failure = options.failure ?? "continue";
  const formatter = options.formatter ?? createFormatter();

  return {
    registry,
    store,
    async execute(raw, executeOptions) {
      const started = Date.now();
      const sessionId = executeOptions.session?.id ?? DEFAULT_SESSION_ID;
      const scoped =
        executeOptions.include === undefined ? registry : registry.filter(executeOptions.include);
      const validation = validatePlan(raw, scoped, {
        maxSteps: limits.maxSteps,
        allowWrites: executeOptions.allowWrites,
        session: sessionView(store, sessionId),
      });
      if (!validation.ok) {
        return failedValidation(started, validation.issues, formatter, scoped, executeOptions.ctx);
      }

      const failAbort = new AbortController();
      const planBound = bindTimeout(executeOptions.signal, limits.planTimeoutMs, () =>
        planTimeoutError(limits.planTimeoutMs),
      );
      const plan = mergeAbort([planBound.signal, failAbort.signal]);
      const results = new Map<string, StepResult>();

      try {
        for (const level of validation.plan.levels) {
          if (plan.signal.aborted) {
            for (const step of remainingSteps(validation.plan, results)) {
              results.set(step.id, skippedResult(step, cancelReason(plan.signal.reason)));
            }
            break;
          }
          const produced = await mapPool(level, limits.maxParallel, async (step) => {
            if (plan.signal.aborted) {
              return skippedResult(step, cancelReason(plan.signal.reason));
            }
            const blocked = skipIfBlocked(step, results);
            if (blocked !== undefined) return blocked;
            const result = await runStep(step, {
              ctx: executeOptions.ctx,
              sessionId,
              store,
              signal: plan.signal,
              stepTimeoutMs: limits.stepTimeoutMs,
              hooks,
            });
            if (result.status === "error" && failure === "abort" && !failAbort.signal.aborted) {
              failAbort.abort(
                new StepExecutionError(step.id, step.operation.name, result.error ?? "failed"),
              );
            }
            return result;
          });
          for (const result of produced) results.set(result.id, result);
        }
      } finally {
        planBound.dispose();
      }

      const steps = validation.plan.steps.map(
        (step) =>
          results.get(step.id) ??
          skippedResult(step, "Skipped because the plan ended before this step ran."),
      );
      const ok = steps.every((step) => step.status === "ok");
      const durationMs = Date.now() - started;
      const text = formatter.format({
        steps,
        plan: validation.plan,
        registry: scoped,
        ctx: executeOptions.ctx,
      });
      return {
        ok,
        text,
        steps,
        plan: validation.plan,
        issues: undefined,
        durationMs,
        trace: buildTrace({ ok, durationMs, steps, validated: validation.plan, issues: undefined }),
      };
    },
  };
}

function failedValidation<Ctx>(
  started: number,
  issues: ExecutionResult<Ctx>["issues"],
  formatter: Formatter,
  registry: Runtime<Ctx>["registry"],
  ctx: Ctx,
): ExecutionResult<Ctx> {
  const durationMs = Date.now() - started;
  return {
    ok: false,
    text: formatter.format({ steps: [], issues, plan: undefined, registry, ctx }),
    steps: [],
    plan: undefined,
    issues,
    durationMs,
    trace: buildTrace({ ok: false, durationMs, steps: [], validated: undefined, issues }),
  };
}

interface StepRunArgs<Ctx> {
  readonly ctx: Ctx;
  readonly sessionId: string;
  readonly store: Runtime<Ctx>["store"];
  readonly signal: AbortSignal;
  readonly stepTimeoutMs: number;
  readonly hooks: RuntimeHooks<Ctx>;
}

async function runStep<Ctx>(step: ValidatedStep<Ctx>, args: StepRunArgs<Ctx>): Promise<StepResult> {
  const startedAt = Date.now();
  const notices: string[] = [];
  let fields: readonly string[] | "all" | undefined;
  const bound = bindTimeout(args.signal, args.stepTimeoutMs, () =>
    stepTimeoutError(step.id, args.stepTimeoutMs),
  );
  try {
    if (args.hooks.beforeStep !== undefined) {
      await args.hooks.beforeStep({ step, ctx: args.ctx, signal: bound.signal });
    }
    const input = resolveInputs(step, args.store, args.sessionId);
    const runContext: RunContext<(typeof step.operation)["input"], Ctx> = {
      input: input as RunContext<(typeof step.operation)["input"], Ctx>["input"],
      ctx: args.ctx,
      signal: bound.signal,
      step: { id: step.id, operation: step.operation.name },
      notice: (message) => {
        notices.push(message);
      },
      showFields: (names) => {
        fields = names === "all" ? "all" : Object.freeze([...names]);
      },
    };
    const raw = await Promise.race([
      Promise.resolve(step.operation.run(runContext)),
      whenAborted(bound.signal).then((reason) => {
        throw wrapAbort(step, reason);
      }),
    ]);
    if (bound.signal.aborted) throw wrapAbort(step, bound.signal.reason);
    const normalized = normalizeOutput(step.operation as never, raw, step.id);
    const stored = toStored(step, normalized, notices, startedAt);
    const set = args.store.set(args.sessionId, stored);
    if (set.replaced) notices.push(`Reusing step id '${step.id}' replaced the previous result.`);
    for (const id of set.evicted) {
      notices.push(
        set.cap === undefined
          ? `Dropped stored result '${id}' (oldest in this session) to stay within the session's result cap.`
          : `Dropped stored result '${id}' (oldest in this session) because the session already holds ${set.cap} results.`,
      );
    }
    if (set.replaced || set.evicted.length > 0) {
      args.store.set(args.sessionId, { ...stored, notices: [...notices] });
    }
    const result = okResult(step, normalized, notices, startedAt, set.replaced, fields);
    if (args.hooks.afterStep !== undefined) {
      await args.hooks.afterStep({ step, ctx: args.ctx, signal: bound.signal, result });
    }
    return result;
  } catch (error) {
    if (args.hooks.onStepError !== undefined) {
      try {
        await args.hooks.onStepError({ step, ctx: args.ctx, signal: bound.signal, error });
      } catch {
        // A hook failure must not hide the original step error.
      }
    }
    return errorResult(step, error, notices, startedAt);
  } finally {
    bound.dispose();
  }
}

function resolveInputs<Ctx>(
  step: ValidatedStep<Ctx>,
  store: Runtime<Ctx>["store"],
  sessionId: string,
): unknown {
  let input = step.input;
  for (const ref of step.refs) {
    const stored = store.get(sessionId, ref.ref.id);
    if (stored === undefined) {
      throw new RefResolutionError(
        ref.site.text,
        `${formatPath(ref.site.path)} references '${ref.site.text}', but that result is no longer stored.`,
        step.id,
      );
    }
    input = setAtPath(input, ref.site.path, resolveRef(stored, ref.ref, step.id));
  }
  return input;
}

function toStored<Ctx>(
  step: ValidatedStep<Ctx>,
  normalized: ReturnType<typeof normalizeOutput>,
  notices: readonly string[],
  startedAt: number,
): StoredResult {
  return {
    id: step.id,
    operation: step.operation.name,
    kind: normalized.kind,
    type: normalized.type,
    data: normalized.data,
    items: normalized.items,
    count: normalized.count,
    notices,
    storedAt: startedAt,
  };
}

function okResult<Ctx>(
  step: ValidatedStep<Ctx>,
  normalized: ReturnType<typeof normalizeOutput>,
  notices: readonly string[],
  startedAt: number,
  replaced: boolean,
  fields: readonly string[] | "all" | undefined,
): StepResult {
  return {
    id: step.id,
    operation: step.operation.name,
    status: "ok",
    kind: normalized.kind,
    type: normalized.type,
    count: normalized.count,
    data: normalized.data,
    items: normalized.items,
    notices: Object.freeze([...notices]),
    fields,
    error: undefined,
    skippedBecause: undefined,
    durationMs: Date.now() - startedAt,
    startedAt,
    referenced: step.referenced,
    present: inferredPresent(step),
    replaced,
  };
}

function errorResult<Ctx>(
  step: ValidatedStep<Ctx>,
  error: unknown,
  notices: readonly string[],
  startedAt: number,
): StepResult {
  return {
    id: step.id,
    operation: step.operation.name,
    status: "error",
    kind: undefined,
    type: undefined,
    count: undefined,
    data: undefined,
    items: undefined,
    notices: Object.freeze([...notices]),
    fields: undefined,
    error: executionMessage(step.id, step.operation.name, error),
    skippedBecause: undefined,
    durationMs: Date.now() - startedAt,
    startedAt,
    referenced: step.referenced,
    present: inferredPresent(step),
    replaced: false,
  };
}

function skippedResult<Ctx>(step: ValidatedStep<Ctx>, reason: string): StepResult {
  const startedAt = Date.now();
  return {
    id: step.id,
    operation: step.operation.name,
    status: "skipped",
    kind: undefined,
    type: undefined,
    count: undefined,
    data: undefined,
    items: undefined,
    notices: [],
    fields: undefined,
    error: undefined,
    skippedBecause: reason,
    durationMs: 0,
    startedAt,
    referenced: step.referenced,
    present: inferredPresent(step),
    replaced: false,
  };
}

function inferredPresent<Ctx>(step: ValidatedStep<Ctx>): Presentation {
  if (step.present !== "auto") return step.present;
  return step.referenced ? "preview" : "full";
}

function skipIfBlocked<Ctx>(
  step: ValidatedStep<Ctx>,
  results: ReadonlyMap<string, StepResult>,
): StepResult | undefined {
  for (const id of step.dependencies) {
    const dependency = results.get(id);
    if (dependency === undefined) {
      return skippedResult(step, `Skipped because step '${id}' did not run.`);
    }
    if (dependency.status === "error") {
      return skippedResult(step, `Skipped because step '${id}' failed.`);
    }
    if (dependency.status === "skipped") {
      return skippedResult(step, `Skipped because step '${id}' was skipped.`);
    }
  }
  return undefined;
}

function remainingSteps<Ctx>(
  plan: ValidatedPlan<Ctx>,
  results: ReadonlyMap<string, StepResult>,
): ValidatedStep<Ctx>[] {
  return plan.steps.filter((step) => !results.has(step.id));
}

function cancelReason(reason: unknown): string {
  if (reason instanceof LimitExceededError) return reason.message;
  return "Skipped because the plan was cancelled.";
}

function wrapAbort<Ctx>(step: ValidatedStep<Ctx>, reason: unknown): Error {
  if (reason instanceof Error) return reason;
  return new StepExecutionError(step.id, step.operation.name, `Step '${step.id}' was cancelled.`);
}

function executionMessage(stepId: string, operation: string, error: unknown): string {
  if (error instanceof LimitExceededError) return error.message;
  if (error instanceof RefResolutionError) return error.message;
  if (error instanceof AgentweftError) return error.message;
  if (isAbortLike(error)) return `Step '${stepId}' was cancelled.`;
  if (error instanceof Error && error.message.length > 0) {
    return `Step '${stepId}' failed while running '${operation}': ${error.message}`;
  }
  return `Step '${stepId}' failed while running '${operation}'.`;
}

function isAbortLike(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
