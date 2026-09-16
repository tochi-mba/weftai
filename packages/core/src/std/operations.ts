import { z } from "zod";
import { LimitExceededError, StepExecutionError } from "../errors.js";
import { defineOperationFor, type Operation } from "../operation.js";
import { ref } from "../schema/ref.js";
import {
  type CollectionType,
  type Group,
  groups,
  type ResultType,
  value,
  withSources,
} from "../schema/types.js";
import { resolveField } from "./fields.js";
import { FILTER_OPS, type Filter, matchesFilter } from "./match.js";

export const STANDARD_OP_KINDS = [
  "filter",
  "count",
  "countBy",
  "distinct",
  "mostCommon",
  "first",
  "pick",
  "details",
] as const;

export type StandardOpKind = (typeof STANDARD_OP_KINDS)[number];

export interface StandardOperationsOptions {
  readonly include?: readonly StandardOpKind[] | undefined;
  /** Hard cap on items a filter/distinct/details step may return. Exceeding it is an error. */
  readonly maxItems?: number | undefined;
}

const FilterClause = z.object({
  field: z.string(),
  op: z.enum(FILTER_OPS).default("eq"),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

/**
 * Standard operations derived from one collection type: filter, count, countBy, distinct,
 * mostCommon, first, pick and details. Field names are resolved against `type.fields(ctx)`.
 */
export function standardOperations<T, Ctx>(
  type: CollectionType<T, Ctx>,
  options: StandardOperationsOptions = {},
): Operation<z.ZodType, ResultType, Ctx>[] {
  const define = defineOperationFor<Ctx>();
  const include = new Set(options.include ?? STANDARD_OP_KINDS);
  const maxItems = options.maxItems;
  const ops: Operation<z.ZodType, ResultType, Ctx>[] = [];

  if (include.has("filter")) {
    ops.push(
      define({
        name: `${type.name}.filter`,
        description: `Keep ${type.name} that match every filter. A wrong field name is an error, not an empty result.`,
        input: z.object({
          from: ref(type),
          filters: z.array(FilterClause).default([]),
        }),
        output: type,
        examples: [
          { input: { from: "$prev", filters: [{ field: "label", op: "eq", value: "Acme" }] } },
        ],
        run: ({ input, ctx, step }) => {
          const items = applyFilters(
            type,
            input.from.items as readonly T[],
            input.filters,
            ctx,
            step.id,
          );
          return cap(type, items, maxItems, `${type.name}.filter`);
        },
      }),
    );
  }

  if (include.has("count")) {
    ops.push(
      define({
        name: `${type.name}.count`,
        description: `Count ${type.name}. References to this step resolve to the ${type.name} that were counted.`,
        input: z.object({ from: ref(type) }),
        output: value(z.number()),
        sources: type,
        run: ({ input }) =>
          withSources(
            input.from.count,
            type as CollectionType<T, never>,
            input.from.items as readonly T[],
          ),
      }),
    );
  }

  if (include.has("countBy")) {
    ops.push(
      define({
        name: `${type.name}.countBy`,
        description: `Group ${type.name} by a field, most common first.`,
        input: z.object({ from: ref(type), field: z.string() }),
        output: groups(),
        sources: type,
        run: ({ input, ctx, step }) => {
          const grouped = countBy(
            type,
            input.from.items as readonly T[],
            input.field,
            ctx,
            step.id,
          );
          return withSources(
            grouped,
            type as CollectionType<T, never>,
            input.from.items as readonly T[],
          );
        },
      }),
    );
  }

  if (include.has("distinct")) {
    ops.push(
      define({
        name: `${type.name}.distinct`,
        description: `Keep the first ${type.name} for each distinct value of a field.`,
        input: z.object({ from: ref(type), field: z.string() }),
        output: type,
        run: ({ input, ctx, step, notice }) => {
          const field = mustField(type, input.field, ctx, step.id);
          const seen = new Set<string>();
          const kept: T[] = [];
          for (const item of input.from.items as readonly T[]) {
            const key = stringify(field.get(item));
            if (seen.has(key)) continue;
            seen.add(key);
            kept.push(item);
          }
          notice(`${kept.length} distinct ${input.field} value(s) from ${input.from.count}.`);
          return cap(type, kept, maxItems, `${type.name}.distinct`);
        },
      }),
    );
  }

  if (include.has("mostCommon")) {
    ops.push(
      define({
        name: `${type.name}.mostCommon`,
        description: `The most common value of a field among ${type.name}, with its count.`,
        input: z.object({ from: ref(type), field: z.string(), limit: z.int().min(1).default(1) }),
        output: groups(),
        sources: type,
        run: ({ input, ctx, step }) => {
          const grouped = countBy(
            type,
            input.from.items as readonly T[],
            input.field,
            ctx,
            step.id,
          );
          return withSources(
            grouped.slice(0, input.limit),
            type as CollectionType<T, never>,
            input.from.items as readonly T[],
          );
        },
      }),
    );
  }

  if (include.has("first")) {
    ops.push(
      define({
        name: `${type.name}.first`,
        description: `The first item in a ${type.name} result. Empty when the set is empty.`,
        input: z.object({ from: ref(type) }),
        output: type,
        run: ({ input }) => (input.from.items as readonly T[]).slice(0, 1),
      }),
    );
  }

  if (include.has("pick")) {
    ops.push(
      define({
        name: `${type.name}.pick`,
        description: `Pick ${type.name} by 1-based positions in the full result set.`,
        input: z.object({
          from: ref(type),
          ordinals: z.array(z.int().min(1)).min(1),
        }),
        output: type,
        run: ({ input, step }) => {
          const items = input.from.items as readonly T[];
          const picked: T[] = [];
          for (const n of input.ordinals) {
            const item = items[n - 1];
            if (item === undefined) {
              throw new StepExecutionError(
                step.id,
                `${type.name}.pick`,
                `'${n}' is out of range; '${input.from.type}' holds ${items.length} item(s). Use a position between 1 and ${items.length}.`,
              );
            }
            picked.push(item);
          }
          return picked;
        },
      }),
    );
  }

  if (include.has("details")) {
    ops.push(
      define({
        name: `${type.name}.details`,
        description: `Show ${type.name} with their properties: every field, or only those named in fields. Unknown fields are an error; absent values show as not recorded.`,
        input: z.object({
          from: ref(type),
          fields: z.array(z.string()).min(1).optional(),
        }),
        output: type,
        examples: [{ input: { from: "$prev", fields: ["Jurisdiction"] } }],
        run: ({ input, ctx, step, showFields }) => {
          if (input.fields === undefined) {
            showFields("all");
          } else {
            for (const name of input.fields) mustField(type, name, ctx, step.id);
            showFields(input.fields);
          }
          return cap(type, input.from.items as readonly T[], maxItems, `${type.name}.details`);
        },
      }),
    );
  }

  return ops;
}

function applyFilters<T, Ctx>(
  type: CollectionType<T, Ctx>,
  items: readonly T[],
  filters: readonly Filter[],
  ctx: Ctx,
  stepId: string,
): T[] {
  const resolved = filters.map((filter) => ({
    filter,
    field: mustField(type, filter.field, ctx, stepId),
  }));
  return items.filter((item) =>
    resolved.every(({ filter, field }) => matchesFilter(field.get(item), filter)),
  );
}

function countBy<T, Ctx>(
  type: CollectionType<T, Ctx>,
  items: readonly T[],
  fieldName: string,
  ctx: Ctx,
  stepId: string,
): Group[] {
  const field = mustField(type, fieldName, ctx, stepId);
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = stringify(field.get(item));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => ({ key, count })).sort(compareGroups);
}

const NOT_RECORDED = "not recorded";

/** Most common first, ties by key; items with no recorded value are reported, but always last. */
export function compareGroups(a: Group, b: Group): number {
  const aMissing = a.key === NOT_RECORDED;
  const bMissing = b.key === NOT_RECORDED;
  if (aMissing !== bMissing) return aMissing ? 1 : -1;
  return b.count - a.count || a.key.localeCompare(b.key);
}

function mustField<T, Ctx>(type: CollectionType<T, Ctx>, name: string, ctx: Ctx, stepId: string) {
  const resolved = resolveField(type, name, ctx);
  if (!resolved.ok) {
    throw new StepExecutionError(stepId, `${type.name}.field`, resolved.message);
  }
  return resolved.field;
}

function cap<T, Ctx>(
  type: CollectionType<T, Ctx>,
  items: readonly T[],
  maxItems: number | undefined,
  operation: string,
): readonly T[] {
  if (maxItems !== undefined && items.length > maxItems) {
    throw new LimitExceededError(
      "maxItems",
      items.length,
      maxItems,
      `${operation} matched ${items.length} ${type.name}; at most ${maxItems} are allowed. Narrow the query.`,
    );
  }
  return items;
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return NOT_RECORDED;
  return String(value);
}
