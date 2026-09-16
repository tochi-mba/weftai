import { formatIssues, type PlanIssue } from "../errors.js";
import type { StepResult } from "../executor/types.js";
import type { AnyOperation } from "../operation.js";
import type { ValidatedPlan } from "../plan/validate.js";
import type { Registry } from "../registry.js";
import type { CollectionType, FieldSpec } from "../schema/types.js";
import { formatProperty, sanitizeLabel } from "./sanitize.js";

export interface RenderedStep {
  readonly header: string;
  readonly lines: readonly string[];
  readonly notices: readonly string[];
}

export const PREVIEW_NOTICE = (id: string) =>
  `[intermediate step - preview only; reference $${id} to use the full set]`;

export function renderValidation(issues: readonly PlanIssue[]): string {
  return formatIssues(issues);
}

/**
 * One step as the model reads it. Rules: the collection name follows every step id that has one,
 * counts are always exact, internal ids never appear, absent properties are `not recorded`.
 */
export function renderStep<Ctx>(
  step: StepResult,
  args: {
    readonly registry: Registry<Ctx>;
    readonly ctx: Ctx;
    readonly plan?: ValidatedPlan<Ctx> | undefined;
  },
): RenderedStep {
  if (step.status === "error") {
    return {
      header: `${step.id}: failed`,
      lines: indent(step.error ?? "The step failed."),
      notices: [...step.notices],
    };
  }
  if (step.status === "skipped") {
    return {
      header: `${step.id}: skipped`,
      lines: indent(step.skippedBecause ?? "Skipped."),
      notices: [...step.notices],
    };
  }

  const operation = args.registry.get(step.operation);
  const notices = [...step.notices];
  if (step.present === "preview") notices.push(PREVIEW_NOTICE(step.id));
  const header = headerFor(step);

  if (step.kind === "collection") {
    return { header, lines: collectionLines(step, operation, args.ctx), notices };
  }
  if (step.kind === "groups") {
    const rows = Array.isArray(step.data) ? step.data : [];
    return { header, lines: rows.map((row) => groupLine(asGroup(row))), notices };
  }
  return { header, lines: [`  ${formatProperty(step.data)}`], notices };
}

/** `id (type): N matched` whenever the step has entities behind it; otherwise a plain form. */
function headerFor(step: StepResult): string {
  if (step.type !== undefined && step.count !== undefined) {
    return `${step.id} (${step.type}): ${step.count} matched`;
  }
  if (step.kind === "groups") {
    const rows = Array.isArray(step.data) ? step.data.length : 0;
    return `${step.id} (groups): ${rows} group${rows === 1 ? "" : "s"}`;
  }
  if (step.kind === "collection") {
    return `${step.id} (${step.type ?? "items"}): ${step.count ?? step.items?.length ?? 0} matched`;
  }
  return `${step.id}: ${formatProperty(step.data)}`;
}

function collectionLines<Ctx>(
  step: StepResult,
  operation: AnyOperation<Ctx> | undefined,
  ctx: Ctx,
): string[] {
  const items = step.items ?? [];
  const output = operation?.output;
  const type = output?.kind === "collection" ? output : undefined;
  const labelOf =
    type === undefined
      ? (item: unknown) => sanitizeLabel(fallbackLabel(item))
      : (item: unknown) => sanitizeLabel(String(type.label(item)));
  const fields = shownFields(step.fields, type, ctx);

  return items.map((item, index) => {
    const label = labelOf(item);
    const shown = fields.filter(
      (field) => step.fields !== "all" || formatProperty(field.get(item)) !== label,
    );
    if (shown.length === 0) return `  ${index + 1}. ${label}`;
    const extra = shown
      .map((field) => `${field.name}: ${formatProperty(field.get(item))}`)
      .join("; ");
    return `  ${index + 1}. ${label} - ${extra}`;
  });
}

function shownFields<Ctx>(
  requested: readonly string[] | "all" | undefined,
  type: CollectionType<unknown, Ctx> | undefined,
  ctx: Ctx,
): FieldSpec<unknown>[] {
  if (requested === undefined || type === undefined || type.fields === undefined) return [];
  const catalogue = type.fields(ctx);
  if (requested === "all") return [...catalogue];
  const shown: FieldSpec<unknown>[] = [];
  for (const name of requested) {
    const exact = catalogue.find((field) => field.name === name);
    const aliased = catalogue.find((field) => field.aliases?.includes(name) === true);
    const field = exact ?? aliased;
    if (field !== undefined && !shown.includes(field)) shown.push(field);
  }
  return shown;
}

function groupLine(group: { key: string; count: number }): string {
  return `  ${sanitizeLabel(group.key)}: ${group.count}`;
}

function fallbackLabel(item: unknown): string {
  if (typeof item === "string" || typeof item === "number") return String(item);
  if (typeof item === "object" && item !== null && "label" in item) {
    return String((item as { label: unknown }).label);
  }
  return JSON.stringify(item);
}

function asGroup(value: unknown): { key: string; count: number } {
  if (typeof value === "object" && value !== null && "key" in value && "count" in value) {
    const row = value as { key: unknown; count: unknown };
    return { key: String(row.key), count: Number(row.count) };
  }
  return { key: String(value), count: 0 };
}

function indent(text: string): string[] {
  return text.split("\n").map((line) => `  ${line}`);
}
