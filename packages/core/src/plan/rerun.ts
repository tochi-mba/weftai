import { DefinitionError, type PlanIssue } from "../errors.js";
import type { StepStatus } from "../executor/types.js";
import type { Registry } from "../registry.js";
import { sessionView } from "../results/session.js";
import type { ResultStore } from "../results/types.js";
import { closest } from "../util/levenshtein.js";
import { PlanSchema, type PlanStep } from "./types.js";
import {
  RERUN_NOT_KEPT,
  type ValidatedPlan,
  type ValidatedStep,
  validatePlan,
} from "./validate.js";

/** An executed plan as a later `rerun` reads it: its steps and how each one ended. */
export interface PlanRecord {
  readonly steps: readonly PlanStep[];
  readonly outcome: Readonly<Record<string, StepStatus>>;
  readonly storedAt: number;
}

/**
 * The plans a session ran, found by any of their step ids. A step id that a later plan reuses
 * points at the later plan, as a stored result does.
 */
export interface PlanStore {
  get(sessionId: string, stepId: string): PlanRecord | undefined;
  set(sessionId: string, record: PlanRecord): void;
  /** Step ids that name a plan this store still holds, for "did you mean" hints. */
  ids(sessionId: string): readonly string[];
  clear(sessionId: string): void;
}

export interface MemoryPlanStoreOptions {
  readonly ttlMs?: number | undefined;
  /** How many plans one session keeps; the oldest goes first. */
  readonly maxPlans?: number | undefined;
  readonly now?: (() => number) | undefined;
}

export const DEFAULT_PLAN_STORE_LIMITS = {
  ttlMs: 30 * 60 * 1000,
  maxPlans: 50,
} as const;

export function createMemoryPlanStore(options: MemoryPlanStoreOptions = {}): PlanStore {
  const ttlMs = options.ttlMs ?? DEFAULT_PLAN_STORE_LIMITS.ttlMs;
  const maxPlans = options.maxPlans ?? DEFAULT_PLAN_STORE_LIMITS.maxPlans;
  const now = options.now ?? Date.now;
  if (!(ttlMs > 0)) {
    throw new DefinitionError(
      `Plan store ttlMs must be a positive number or Infinity, not ${String(ttlMs)}.`,
    );
  }
  if (!Number.isInteger(maxPlans) || maxPlans < 1) {
    throw new DefinitionError(
      `Plan store maxPlans must be an integer of at least 1, not ${String(maxPlans)}.`,
    );
  }
  const sessions = new Map<string, PlanRecord[]>();

  function live(sessionId: string): PlanRecord[] {
    const records = (sessions.get(sessionId) ?? []).filter(
      (record) => now() - record.storedAt < ttlMs,
    );
    if (records.length === 0) sessions.delete(sessionId);
    else sessions.set(sessionId, records);
    return records;
  }

  return {
    get(sessionId, stepId) {
      return live(sessionId).findLast((record) => record.steps.some((step) => step.id === stepId));
    },
    set(sessionId, record) {
      const records = [...live(sessionId), record];
      sessions.set(sessionId, records.slice(Math.max(0, records.length - maxPlans)));
    },
    ids(sessionId) {
      return [...new Set(live(sessionId).flatMap((record) => record.steps.map((step) => step.id)))];
    },
    clear(sessionId) {
      sessions.delete(sessionId);
    },
  };
}

export interface RerunOptions {
  /** Where earlier plans are kept; `null` when nothing keeps them. */
  readonly plans: PlanStore | null;
  readonly store: ResultStore;
  readonly sessionId: string;
  readonly maxSteps?: number | undefined;
  readonly allowWrites?: boolean | undefined;
}

export type RerunResult<Ctx> =
  | {
      readonly ok: true;
      readonly plan: ValidatedPlan<Ctx>;
      /** Every step of the plan to run, as written: an earlier plan's steps with the changes. */
      readonly steps: readonly PlanStep[];
      /** Ids of steps whose earlier results stand; they are not run. */
      readonly reused: readonly string[];
      /** The step `rerun` named, when this is a rerun. */
      readonly of: string | undefined;
    }
  | { readonly ok: false; readonly issues: readonly PlanIssue[] };

/**
 * The plan a call will run, rerun or not.
 *
 * A plain plan is validated as it is. A rerun takes the earlier plan its `rerun` step belongs to,
 * replaces the steps whose ids `steps` repeats, adds the new ones at the end, and validates the
 * whole like a new plan. A step runs when it changed, did not succeed last time, has lost its
 * stored result, or reads from a step that runs; every other step is reused. A write that
 * succeeded runs again only when `steps` names it.
 *
 * `runtime.execute` builds every plan through this, so a host that gates steps before executing
 * can call it first and see exactly what will run.
 */
export function buildRerun<Ctx>(
  raw: unknown,
  registry: Registry<Ctx>,
  options: RerunOptions,
): RerunResult<Ctx> {
  const validateOptions = {
    maxSteps: options.maxSteps,
    allowWrites: options.allowWrites,
    session: sessionView(options.store, options.sessionId),
  };
  const shape = PlanSchema.safeParse(raw);
  // A malformed plan: validatePlan words the same issue it always has.
  if (!shape.success) return validatePlan(raw, registry, validateOptions) as RerunResult<Ctx>;
  if (typeof shape.data.rerun !== "string") {
    const validation = validatePlan(raw, registry, validateOptions);
    if (!validation.ok) return validation;
    const steps = shape.data.steps;
    return { ok: true, plan: validation.plan, steps, reused: [], of: undefined };
  }
  const named = shape.data.rerun;
  if (options.plans === null) return { ok: false, issues: [RERUN_NOT_KEPT] };
  const record = options.plans.get(options.sessionId, named);
  if (record === undefined) {
    const suggestion = closest(named, options.plans.ids(options.sessionId));
    return {
      ok: false,
      issues: [
        {
          code: "rerun.unknown_plan",
          message: `No earlier plan in this session has a step named '${named}'.`,
          hint: suggestion === undefined ? "Send the whole plan." : `Did you mean '${suggestion}'?`,
        },
      ],
    };
  }

  const seen = new Set<string>();
  for (const step of shape.data.steps) {
    if (seen.has(step.id)) {
      return {
        ok: false,
        issues: [
          {
            code: "step.duplicate_id",
            stepId: step.id,
            message: `Step id '${step.id}' is used more than once in this plan.`,
            hint: "Give each step a distinct id.",
          },
        ],
      };
    }
    seen.add(step.id);
  }
  const changes = new Map(shape.data.steps.map((step) => [step.id, step]));
  const earlier = new Set(record.steps.map((step) => step.id));
  const steps = [
    ...record.steps.map((step) => changes.get(step.id) ?? step),
    ...shape.data.steps.filter((step) => !earlier.has(step.id)),
  ];
  const validation = validatePlan({ steps }, registry, validateOptions);
  if (!validation.ok) return validation;

  const runs = new Set<string>();
  const issues: PlanIssue[] = [];
  for (const step of validation.plan.steps) {
    const why = reasonToRun(step, changes, record, options, runs);
    if (why === undefined) continue;
    runs.add(step.id);
    const wrote = step.operation.effects === "write" && record.outcome[step.id] === "ok";
    if (wrote && !changes.has(step.id)) {
      issues.push({
        code: "rerun.write_would_repeat",
        stepId: step.id,
        message: `Step '${step.id}' already wrote, and rerunning would write again because ${why}.`,
        hint: `Put '${step.id}' in steps to run it again on purpose, or send a new plan.`,
      });
    }
  }
  if (issues.length > 0) return { ok: false, issues };
  const reused = validation.plan.steps.map((step) => step.id).filter((id) => !runs.has(id));
  return { ok: true, plan: validation.plan, steps, reused, of: named };
}

/** Why a step of a rerun runs, as the end of a sentence, or `undefined` when it is reused. */
function reasonToRun<Ctx>(
  step: ValidatedStep<Ctx>,
  changes: ReadonlyMap<string, PlanStep>,
  record: PlanRecord,
  options: RerunOptions,
  runs: ReadonlySet<string>,
): string | undefined {
  if (changes.has(step.id)) return "it changed";
  const upstream = step.dependencies.find((id) => runs.has(id));
  if (upstream !== undefined) return `step '${upstream}', which it reads, runs again`;
  if (record.outcome[step.id] !== "ok") return "it did not succeed last time";
  if (options.store.get(options.sessionId, step.id) === undefined) {
    return "its stored result is gone";
  }
  return undefined;
}
