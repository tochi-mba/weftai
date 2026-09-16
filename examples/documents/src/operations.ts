import {
  collection,
  defineOperationFor,
  type FilterOp,
  matchesFilter,
  resolveField,
  StepExecutionError,
  standardOperations,
  z,
} from "weftai";
import { Contract, type DocumentsContext } from "./types.js";

const FilterClause = z.object({
  field: z.string(),
  op: z
    .enum(["eq", "ne", "contains", "startsWith", "gt", "gte", "lt", "lte", "fuzzy"])
    .default("eq"),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export const Contracts = collection("contracts", Contract, {
  label: (c) => c.title,
  key: (c) => c.id,
  fields: () => [
    { name: "title", aliases: ["name"], get: (c) => c.title },
    { name: "owner", get: (c) => c.owner },
    { name: "expiresOn", aliases: ["expiry", "expires"], get: (c) => c.expiresOn },
  ],
});

const define = defineOperationFor<DocumentsContext>();

export const search = define({
  name: "contracts.search",
  description: "Find contracts by title, owner or expiry. Use this as the first step.",
  input: z.object({ filters: z.array(FilterClause).default([]) }),
  output: Contracts,
  examples: [{ input: { filters: [{ field: "title", op: "contains", value: "MSA" }] } }],
  run: ({ input, ctx, step }) =>
    ctx.contracts.filter((contract) =>
      input.filters.every((filter) => {
        const resolved = resolveField(Contracts, filter.field, ctx);
        if (!resolved.ok) {
          throw new StepExecutionError(step.id, "contracts.search", resolved.message);
        }
        return matchesFilter(resolved.field.get(contract), {
          field: filter.field,
          op: filter.op as FilterOp,
          value: filter.value,
        });
      }),
    ),
});

export const expiringWithin = define({
  name: "contracts.expiringWithin",
  description: "Contracts whose expiry falls within N days of a date (defaults to today).",
  input: z.object({
    withinDays: z.int().min(0),
    asOf: z.string().optional(),
  }),
  output: Contracts,
  examples: [{ input: { withinDays: 30 } }],
  run: ({ input, ctx }) => {
    const start = parseDay(input.asOf ?? ctx.now);
    const end = start + input.withinDays * 86_400_000;
    return ctx.contracts.filter((contract) => {
      const expires = parseDay(contract.expiresOn);
      return expires >= start && expires <= end;
    });
  },
});

export function documentOperations() {
  return [search, expiringWithin, ...standardOperations(Contracts)];
}

function parseDay(iso: string): number {
  const value = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(value)) {
    throw new Error(`'${iso}' is not an ISO date (YYYY-MM-DD).`);
  }
  return value;
}
