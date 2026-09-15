import type { z } from "zod";
import type { PlanIssue } from "../errors.js";
import { isValidStepId, STEP_ID_RULE } from "../ids.js";
import { type AnyOperation, type Presentation, provenanceType } from "../operation.js";
import type { ParsedRef } from "../refs/syntax.js";
import type { Registry } from "../registry.js";
import { summarizeSchema } from "../schema/summarize.js";
import { collectRefs, formatPath, type Path, type RefSite } from "../schema/walk.js";
import { closest } from "../util/levenshtein.js";
import { PlanSchema } from "./types.js";

/** What validation needs to know about results stored from earlier calls in the same session. */
export interface SessionView {
  has(id: string): boolean;
  ids(): readonly string[];
  /** Collection name a reference to this result resolves to, or `undefined` if it has none. */
  typeOf(id: string): string | undefined;
  countOf(id: string): number | undefined;
}

export interface StepRef {
  readonly site: RefSite;
  readonly ref: ParsedRef;
  /** Whether the target is a step in this plan or a result from an earlier call. */
  readonly source: "plan" | "session";
}

export interface ValidatedStep<Ctx> {
  readonly index: number;
  readonly id: string;
  readonly operation: AnyOperation<Ctx>;
  /** Parsed input with defaults applied; references are still strings here. */
  readonly input: unknown;
  readonly refs: readonly StepRef[];
  /** Ids of steps in this plan that must complete first. */
  readonly dependencies: readonly string[];
  readonly present: Presentation;
  /** True when a later step in this plan references this one. */
  readonly referenced: boolean;
}

export interface ValidatedPlan<Ctx> {
  readonly steps: readonly ValidatedStep<Ctx>[];
  /** Steps grouped so that every step depends only on steps in earlier groups. */
  readonly levels: readonly (readonly ValidatedStep<Ctx>[])[];
}

export interface ValidateOptions {
  readonly maxSteps?: number | undefined;
  /** When false, steps using `write` operations are rejected. Default true. */
  readonly allowWrites?: boolean | undefined;
  readonly session?: SessionView | undefined;
}

export type ValidationResult<Ctx> =
  | { readonly ok: true; readonly plan: ValidatedPlan<Ctx> }
  | { readonly ok: false; readonly issues: readonly PlanIssue[] };

export function validatePlan<Ctx>(
  raw: unknown,
  registry: Registry<Ctx>,
  options: ValidateOptions = {},
): ValidationResult<Ctx> {
  const shape = PlanSchema.safeParse(raw);
  if (!shape.success) {
    return {
      ok: false,
      issues: [
        {
          code: "plan.invalid_shape",
          message: `The plan is malformed: ${describeZodIssues(shape.error.issues)}.`,
          hint: 'Send { "steps": [{ "id": "name", "op": "domain.operation", "input": { } }] }.',
        },
      ],
    };
  }
  const plan = shape.data;
  const issues: PlanIssue[] = [];
  if (options.maxSteps !== undefined && plan.steps.length > options.maxSteps) {
    issues.push({
      code: "plan.too_many_steps",
      message: `The plan has ${plan.steps.length} steps; at most ${options.maxSteps} are allowed per call.`,
      hint: "Split the work across calls; results stay available by name.",
    });
  }

  const indexById = new Map<string, number>();
  plan.steps.forEach((step, index) => {
    if (!isValidStepId(step.id)) {
      issues.push({
        code: "step.invalid_id",
        stepId: step.id,
        message: `'${step.id}' is not a valid step id.`,
        hint: STEP_ID_RULE,
      });
    } else if (indexById.has(step.id)) {
      issues.push({
        code: "step.duplicate_id",
        stepId: step.id,
        message: `Step id '${step.id}' is used more than once in this plan.`,
        hint: "Give each step a distinct id.",
      });
    } else {
      indexById.set(step.id, index);
    }
  });

  const session = options.session;
  const validated: ValidatedStep<Ctx>[] = [];
  const referencedIds = new Set<string>();

  plan.steps.forEach((step, index) => {
    const operation = registry.get(step.op);
    if (operation === undefined) {
      const suggestion = registry.suggest(step.op);
      issues.push({
        code: "step.unknown_operation",
        stepId: step.id,
        message: `Unknown operation '${step.op}'.`,
        hint:
          suggestion === undefined
            ? `Available operations: ${registry.names().join(", ")}.`
            : `Did you mean '${suggestion}'?`,
      });
      return;
    }
    if (operation.effects === "write" && options.allowWrites === false) {
      issues.push({
        code: "step.write_not_allowed",
        stepId: step.id,
        message: `Operation '${step.op}' changes state and cannot be used in this tool.`,
        hint: "Use the tool that performs actions for this step.",
      });
      return;
    }
    const parsed = operation.input.safeParse(step.input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = plainPath(issue.path);
        issues.push({
          code: "step.invalid_input",
          stepId: step.id,
          path,
          message: `${formatPath(path)}: ${issue.message}.`,
          hint: `Expected input: ${summarizeSchema(operation.input)}`,
        });
      }
      return;
    }

    const refs: StepRef[] = [];
    const dependencies = new Set<string>();
    for (const site of collectRefs(operation.input, parsed.data)) {
      const where = formatPath(site.path);
      if (site.parsed === undefined) {
        issues.push({
          code: "ref.invalid_syntax",
          stepId: step.id,
          path: site.path,
          message: `${where}: ${site.error ?? "invalid reference"}`,
        });
        continue;
      }
      const targetId = site.parsed.id;
      if (targetId === step.id) {
        issues.push({
          code: "ref.self_reference",
          stepId: step.id,
          path: site.path,
          message: `${where} references '$${step.id}', which is this step itself.`,
          hint: "Reference an earlier step.",
        });
        continue;
      }
      const targetIndex = indexById.get(targetId);
      if (targetIndex !== undefined) {
        if (targetIndex > index) {
          issues.push({
            code: "ref.forward_reference",
            stepId: step.id,
            path: site.path,
            message: `${where} references '$${targetId}', which is defined later in the plan.`,
            hint: "Order steps so every referenced step comes before the steps that use it.",
          });
          continue;
        }
        const targetOp = registry.get(plan.steps[targetIndex]?.op ?? "");
        if (targetOp !== undefined) {
          const actual = provenanceType(targetOp as AnyOperation<never>);
          const problem = typeMismatch(site, where, actual?.name, describeResult(targetOp));
          if (problem !== undefined) {
            issues.push({
              code: "ref.type_mismatch",
              stepId: step.id,
              path: site.path,
              ...problem,
            });
            continue;
          }
        }
        refs.push({ site, ref: site.parsed, source: "plan" });
        dependencies.add(targetId);
        referencedIds.add(targetId);
        continue;
      }
      if (session?.has(targetId) === true) {
        const problem = typeMismatch(site, where, session.typeOf(targetId), "that stored result");
        if (problem !== undefined) {
          issues.push({ code: "ref.type_mismatch", stepId: step.id, path: site.path, ...problem });
          continue;
        }
        const count = session.countOf(targetId);
        const outOfRange =
          count === undefined ? undefined : site.parsed.ordinals?.find((o) => o > count);
        if (outOfRange !== undefined) {
          issues.push({
            code: "ref.ordinal_out_of_range",
            stepId: step.id,
            path: site.path,
            message: `${where}: '${site.text}' asks for position ${outOfRange}, but '${targetId}' holds ${count} item(s).`,
            hint: `Use a position between 1 and ${count}.`,
          });
          continue;
        }
        refs.push({ site, ref: site.parsed, source: "session" });
        continue;
      }
      const earlierIds = plan.steps.slice(0, index).map((s) => s.id);
      const suggestion = closest(targetId, [...earlierIds, ...(session?.ids() ?? [])]);
      issues.push({
        code: "ref.unknown_target",
        stepId: step.id,
        path: site.path,
        message: `${where} references '$${targetId}', but no earlier step or stored result is named '${targetId}'.`,
        hint: suggestion === undefined ? undefined : `Did you mean '$${suggestion}'?`,
      });
    }

    validated.push({
      index,
      id: step.id,
      operation,
      input: parsed.data,
      refs,
      dependencies: [...dependencies],
      present: step.present ?? operation.present,
      referenced: false,
    });
  });

  if (issues.length > 0) return { ok: false, issues };
  const steps = validated.map((step) => ({ ...step, referenced: referencedIds.has(step.id) }));
  return { ok: true, plan: { steps, levels: computeLevels(steps) } };
}

function typeMismatch(
  site: RefSite,
  where: string,
  actualName: string | undefined,
  describeTarget: string,
): { message: string; hint: string } | undefined {
  const expected = site.meta.target;
  if (actualName === undefined) {
    return {
      message: `${where} references '${site.text}', but ${describeTarget} has no entities to reference.`,
      hint: `Reference a step that returns ${expected === undefined ? "a collection" : expected.name}.`,
    };
  }
  if (expected !== undefined && expected.name !== actualName) {
    return {
      message: `${where} references '${site.text}', which holds ${actualName}, but this field expects ${expected.name}.`,
      hint: `Reference a step that returns ${expected.name}.`,
    };
  }
  return undefined;
}

function describeResult(operation: AnyOperation<never>): string {
  switch (operation.output.kind) {
    case "collection":
      return `its ${operation.output.name} result`;
    case "groups":
      return "its grouped-count result";
    case "value":
      return "its single-value result";
  }
}

function computeLevels<Ctx>(steps: readonly ValidatedStep<Ctx>[]): ValidatedStep<Ctx>[][] {
  const level = new Map<string, number>();
  const levels: ValidatedStep<Ctx>[][] = [];
  for (const step of steps) {
    let depth = 0;
    for (const dependency of step.dependencies) {
      depth = Math.max(depth, (level.get(dependency) ?? 0) + 1);
    }
    level.set(step.id, depth);
    const bucket = levels[depth];
    if (bucket === undefined) levels[depth] = [step];
    else bucket.push(step);
  }
  return levels;
}

function plainPath(path: readonly PropertyKey[]): Path {
  return path.map((segment) => (typeof segment === "symbol" ? String(segment) : segment));
}

function describeZodIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = plainPath(issue.path);
      return path.length === 0 ? issue.message : `${formatPath(path)}: ${issue.message}`;
    })
    .join("; ");
}
