import type { PlanIssue } from "../errors.js";
import type { StepResult } from "../executor/types.js";
import type { ValidatedPlan } from "../plan/validate.js";
import type { Registry } from "../registry.js";
import { type RenderedStep, renderStep, renderValidation } from "./step.js";
import { DEFAULT_BUDGETS, estimateTokens, type FormatBudgets } from "./tokens.js";

export interface FormatterOptions {
  readonly budgets?: Partial<FormatBudgets> | undefined;
  readonly estimateTokens?: ((text: string) => number) | undefined;
}

export interface FormatArgs<Ctx> {
  readonly steps: readonly StepResult[];
  readonly issues?: readonly PlanIssue[] | undefined;
  readonly plan?: ValidatedPlan<Ctx> | undefined;
  readonly registry: Registry<Ctx>;
  readonly ctx: Ctx;
}

export interface Formatter {
  readonly budgets: FormatBudgets;
  format<Ctx>(args: FormatArgs<Ctx>): string;
}

export function createFormatter(options: FormatterOptions = {}): Formatter {
  const budgets: FormatBudgets = { ...DEFAULT_BUDGETS, ...options.budgets };
  const tokens = options.estimateTokens ?? estimateTokens;

  return {
    budgets,
    format(args) {
      if (args.issues !== undefined && args.issues.length > 0 && args.steps.length === 0) {
        return renderValidation(args.issues);
      }
      const rendered = args.steps.map((step) => {
        const raw = renderStep(step, {
          registry: args.registry,
          ctx: args.ctx,
          plan: args.plan,
        });
        return applyStepBudget(raw, stepBudget(step, budgets), tokens);
      });
      return applyTotalBudget(rendered, budgets.total, tokens);
    },
  };
}

function stepBudget(step: StepResult, budgets: FormatBudgets): number {
  if (step.status !== "ok") return budgets.read;
  return step.present === "preview" ? budgets.preview : budgets.read;
}

function applyStepBudget(
  step: RenderedStep,
  budget: number,
  tokens: (text: string) => number,
): RenderedStep {
  const headerCost = tokens(step.header);
  const noticeCost = step.notices.reduce((sum, notice) => sum + tokens(`  ${notice}`), 0);
  let remaining = budget - headerCost - noticeCost;
  if (remaining < 0) remaining = 0;

  const kept: string[] = [];
  for (const line of step.lines) {
    const cost = tokens(line);
    if (kept.length > 0 && cost > remaining) break;
    if (cost > remaining && kept.length === 0) {
      // Always keep at least the first body line when there is one, so a step is never silent.
      kept.push(line);
      remaining = 0;
      break;
    }
    kept.push(line);
    remaining -= cost;
  }

  const notices = [...step.notices];
  if (kept.length < step.lines.length) {
    notices.push(`showing ${kept.length} of ${step.lines.length}`);
  }
  return { header: step.header, lines: kept, notices };
}

function applyTotalBudget(
  steps: readonly RenderedStep[],
  total: number,
  tokens: (text: string) => number,
): string {
  const bodies = steps.map((step) => [...step.lines]);
  const notices = steps.map((step) => [...step.notices]);
  let cut = false;

  const costOf = () =>
    steps.reduce((sum, step, index) => {
      return (
        sum +
        tokens(step.header) +
        (bodies[index] ?? []).reduce((lineSum, line) => lineSum + tokens(line), 0) +
        (notices[index] ?? []).reduce((noticeSum, notice) => noticeSum + tokens(`  ${notice}`), 0)
      );
    }, 0);

  while (costOf() > total) {
    let trimmed = false;
    for (let i = steps.length - 1; i >= 0; i--) {
      const body = bodies[i];
      if (body !== undefined && body.length > 0) {
        body.pop();
        const shown = body.length;
        const full = steps[i]?.lines.length ?? shown;
        const list = notices[i];
        if (list !== undefined) {
          const idx = list.findIndex((notice) => notice.startsWith("showing "));
          const message = `showing ${shown} of ${full}`;
          if (idx >= 0) list[idx] = message;
          else list.push(message);
        }
        trimmed = true;
        cut = true;
        break;
      }
    }
    if (!trimmed) break;
  }

  if (cut) {
    const last = notices[notices.length - 1];
    last?.push(
      `Shown headers for all ${steps.length} steps; bodies truncated to the total budget of ${total} tokens.`,
    );
  }

  return steps
    .map((step, index) => {
      const parts = [step.header, ...(bodies[index] ?? [])];
      for (const notice of notices[index] ?? []) parts.push(`  ${notice}`);
      return parts.join("\n");
    })
    .join("\n");
}
