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

/** A step's rendering plus how many body lines it had before any budget applied. */
interface Row {
  readonly header: string;
  readonly lines: string[];
  readonly full: number;
  readonly notices: string[];
}

function applyStepBudget(
  step: RenderedStep,
  budget: number,
  tokens: (text: string) => number,
): Row {
  const headerCost = tokens(step.header);
  const noticeCost = step.notices.reduce((sum, notice) => sum + tokens(`  ${notice}`), 0);
  let remaining = Math.max(0, budget - headerCost - noticeCost);

  const kept: string[] = [];
  for (const line of step.lines) {
    const cost = tokens(line);
    if (cost > remaining) {
      // Always keep at least the first body line, so a step is never silent.
      if (kept.length === 0) kept.push(line);
      break;
    }
    kept.push(line);
    remaining -= cost;
  }

  const notices = [...step.notices];
  if (kept.length < step.lines.length) {
    notices.push(`showing ${kept.length} of ${step.lines.length}`);
  }
  return { header: step.header, lines: kept, full: step.lines.length, notices };
}

function rowCost(row: Row, tokens: (text: string) => number): number {
  return (
    tokens(row.header) +
    row.lines.reduce((sum, line) => sum + tokens(line), 0) +
    row.notices.reduce((sum, notice) => sum + tokens(`  ${notice}`), 0)
  );
}

/** Trim bodies from the last step backwards until the whole response fits; headers always stay. */
function applyTotalBudget(
  rows: readonly Row[],
  total: number,
  tokens: (text: string) => number,
): string {
  const costOf = () => rows.reduce((sum, row) => sum + rowCost(row, tokens), 0);
  let cut = false;

  while (costOf() > total) {
    const victim = [...rows].reverse().find((row) => row.lines.length > 0);
    if (victim === undefined) break;
    victim.lines.pop();
    const message = `showing ${victim.lines.length} of ${victim.full}`;
    const existing = victim.notices.findIndex((notice) => notice.startsWith("showing "));
    if (existing >= 0) victim.notices[existing] = message;
    else victim.notices.push(message);
    cut = true;
  }

  if (cut) {
    // `cut` implies at least one row exists.
    const last = rows[rows.length - 1] as Row;
    last.notices.push(
      `Shown headers for all ${rows.length} steps; bodies truncated to the total budget of ${total} tokens.`,
    );
  }

  return rows
    .map((row) =>
      [row.header, ...row.lines, ...row.notices.map((notice) => `  ${notice}`)].join("\n"),
    )
    .join("\n");
}
