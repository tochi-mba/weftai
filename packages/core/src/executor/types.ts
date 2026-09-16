import type { PlanIssue } from "../errors.js";
import type { Formatter } from "../format/formatter.js";
import type { AnyOperation, Presentation } from "../operation.js";
import type { ValidatedPlan, ValidatedStep } from "../plan/validate.js";
import type { Registry } from "../registry.js";
import type { ResultKind, ResultStore } from "../results/types.js";

export const DEFAULT_LIMITS = {
  maxSteps: 20,
  stepTimeoutMs: 10_000,
  planTimeoutMs: 60_000,
  maxParallel: 4,
} as const;

export const TRACE_VERSION = 1 as const;

export type FailurePolicy = "continue" | "abort";
export type StepStatus = "ok" | "error" | "skipped";

export interface RuntimeLimits {
  readonly maxSteps?: number | undefined;
  readonly stepTimeoutMs?: number | undefined;
  readonly planTimeoutMs?: number | undefined;
  readonly maxParallel?: number | undefined;
}

export interface StepHookInfo<Ctx> {
  readonly step: ValidatedStep<Ctx>;
  readonly ctx: Ctx;
  readonly signal: AbortSignal;
}

export interface RuntimeHooks<Ctx> {
  beforeStep?(info: StepHookInfo<Ctx>): void | Promise<void>;
  afterStep?(info: StepHookInfo<Ctx> & { readonly result: StepResult }): void | Promise<void>;
  onStepError?(info: StepHookInfo<Ctx> & { readonly error: unknown }): void | Promise<void>;
}

export interface RuntimeOptions<Ctx> {
  readonly registry: Registry<Ctx>;
  readonly store?: ResultStore | undefined;
  readonly limits?: RuntimeLimits | undefined;
  readonly hooks?: RuntimeHooks<Ctx> | undefined;
  readonly failure?: FailurePolicy | undefined;
  readonly formatter?: Formatter | undefined;
}

export interface ExecuteOptions<Ctx> {
  readonly ctx: Ctx;
  readonly session?: { readonly id: string } | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly allowWrites?: boolean | undefined;
  /**
   * Restrict this call to a subset of the registry. An operation outside the subset is unknown to
   * the plan, exactly as if it were not registered, so a tool's scope is enforced, not just shown.
   */
  readonly include?: ((operation: AnyOperation<Ctx>) => boolean) | undefined;
}

export interface StepResult {
  readonly id: string;
  readonly operation: string;
  readonly status: StepStatus;
  readonly kind: ResultKind | undefined;
  readonly type: string | undefined;
  readonly count: number | undefined;
  readonly data: unknown;
  readonly items: readonly unknown[] | undefined;
  readonly notices: readonly string[];
  /** Fields the handler asked to show next to each label, `"all"` for the whole catalogue. */
  readonly fields: readonly string[] | "all" | undefined;
  readonly error: string | undefined;
  readonly skippedBecause: string | undefined;
  readonly durationMs: number;
  readonly startedAt: number;
  readonly referenced: boolean;
  readonly present: Presentation;
  readonly replaced: boolean;
}

export interface TraceInputRef {
  readonly ref: string;
  readonly count: number | undefined;
}

export interface TraceStep {
  readonly id: string;
  readonly operation: string;
  readonly status: StepStatus;
  readonly dependencies: readonly string[];
  /** Model input with `$ref` strings replaced by `{ ref, count }` so traces stay small. */
  readonly input: unknown;
  readonly output:
    | {
        readonly kind: ResultKind | undefined;
        readonly type: string | undefined;
        readonly count: number | undefined;
      }
    | undefined;
  readonly notices: readonly string[];
  readonly error: string | undefined;
  readonly skippedBecause: string | undefined;
  readonly startedAt: number;
  readonly durationMs: number;
}

export interface Trace {
  readonly version: typeof TRACE_VERSION;
  readonly ok: boolean;
  readonly durationMs: number;
  readonly steps: readonly TraceStep[];
  readonly issues: readonly PlanIssue[] | undefined;
}

export interface ExecutionResult<Ctx> {
  readonly ok: boolean;
  /** Model-facing rendering of this execution. Always a string, never truncated silently. */
  readonly text: string;
  readonly steps: readonly StepResult[];
  readonly plan: ValidatedPlan<Ctx> | undefined;
  readonly issues: readonly PlanIssue[] | undefined;
  readonly trace: Trace;
  readonly durationMs: number;
}

export interface Runtime<Ctx> {
  readonly registry: Registry<Ctx>;
  readonly store: ResultStore;
  execute(plan: unknown, options: ExecuteOptions<Ctx>): Promise<ExecutionResult<Ctx>>;
}
