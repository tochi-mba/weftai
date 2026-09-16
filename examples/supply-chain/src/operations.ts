import {
  collection,
  defineOperationFor,
  FILTER_OPS,
  type Filter,
  matchesFilter,
  ref,
  resolveField,
  StepExecutionError,
  standardOperations,
  z,
} from "weftai";
import { findPaths, involving, walkComponents, walkUsedIn } from "./bom.js";
import { linkFields, partFields } from "./fields.js";
import { BomPath, Link, Part, type SupplyChainContext } from "./types.js";

const FilterClause = z.object({
  field: z.string(),
  op: z.enum(FILTER_OPS).default("eq"),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const Depth = z.union([z.int().min(1), z.literal("all"), z.literal("ultimate")]);

export const Parts = collection("parts", Part, {
  label: (p) => p.label,
  key: (p) => p.id,
  fields: () => partFields(),
  description: "Catalog parts: bundles, assemblies, components, tooling.",
});

export const Links = collection("links", Link, {
  label: (l) =>
    `${l.fromLabel} to ${l.toLabel} (${l.relationshipType}${l.label === "" ? "" : ` ${l.label}`})`,
  key: (l) => l.id,
  fields: () => linkFields(),
  description: "Bill-of-materials links between two parts, such as 4 units per assembly.",
});

export const Paths = collection("paths", BomPath, {
  label: (p) => p.label,
  key: (p) => p.id,
  description: "Routes between two parts with hop counts and units needed.",
});

const define = defineOperationFor<SupplyChainContext>();

function keep<T>(
  type: typeof Parts | typeof Links,
  items: readonly T[],
  filters: readonly Filter[],
  ctx: SupplyChainContext,
  stepId: string,
  operation: string,
): T[] {
  const resolved = filters.map((filter) => {
    const field = resolveField(type as never, filter.field, ctx);
    if (!field.ok) throw new StepExecutionError(stepId, operation, field.message);
    return { filter, get: field.field.get as (item: T) => unknown };
  });
  return items.filter((item) =>
    resolved.every(({ filter, get }) => matchesFilter(get(item), filter)),
  );
}

export const findParts = define({
  name: "parts.find",
  description:
    "Find catalog parts by filter (label, partType, origin). Use as the first step to resolve parts by name; fuzzy matching tolerates casing.",
  input: z.object({ filters: z.array(FilterClause).default([]) }),
  output: Parts,
  examples: [{ input: { filters: [{ field: "label", op: "fuzzy", value: "Aurora Drone" }] } }],
  run: ({ input, ctx, step }) =>
    keep(Parts, ctx.catalog.parts, input.filters, ctx, step.id, "parts.find"),
});

export const components = define({
  name: "parts.components",
  description:
    "Everything the given parts are built from, walking Contains links down the bill of materials. linkType defaults to Contains so tooling links do not leak in.",
  input: z.object({
    from: ref(Parts),
    depth: Depth.default("all"),
    linkType: z.string().default("Contains"),
  }),
  output: Parts,
  examples: [{ input: { from: "$drone", depth: "all" } }],
  run: ({ input, ctx }) =>
    walkComponents(
      ctx.catalog,
      input.from.items,
      input.depth === "ultimate" ? "all" : input.depth,
      input.linkType,
    ),
});

export const usedIn = define({
  name: "parts.usedIn",
  description:
    "Which assemblies and products contain the given parts, walking Contains links up. depth 'ultimate' keeps only finished goods that nothing else contains.",
  input: z.object({
    from: ref(Parts),
    depth: Depth.default("all"),
    linkType: z.string().default("Contains"),
  }),
  output: Parts,
  examples: [{ input: { from: "$target", depth: "ultimate" } }],
  run: ({ input, ctx }) => walkUsedIn(ctx.catalog, input.from.items, input.depth, input.linkType),
});

export const findLinks = define({
  name: "links.find",
  description:
    "Find bill-of-materials links. 'involving' keeps links where a part is parent or child; filters can use quantity (an alias for the Contains label), relationshipType, from and to.",
  input: z.object({
    filters: z.array(FilterClause).default([]),
    involving: ref(Parts).optional(),
  }),
  output: Links,
  examples: [
    { input: { involving: "$module" } },
    { input: { filters: [{ field: "quantity", op: "eq", value: "4" }] } },
  ],
  run: ({ input, ctx, step }) => {
    const links =
      input.involving === undefined
        ? ctx.catalog.links
        : involving(ctx.catalog, input.involving.items);
    return keep(Links, links, input.filters, ctx, step.id, "links.find");
  },
});

export const bomPaths = define({
  name: "bom.paths",
  description:
    "How two sets of parts are related: every route between them with hop counts and units needed per unit of the first part. Spans all link types unless linkType is given. Depth and pair caps are reported as notices.",
  input: z.object({
    from: ref(Parts),
    to: ref(Parts),
    linkType: z.string().optional(),
  }),
  output: Paths,
  examples: [{ input: { from: "$assemblies", to: "$tooling" } }],
  run: ({ input, ctx, notice }) =>
    findPaths(ctx.catalog, {
      from: input.from.items,
      to: input.to.items,
      linkType: input.linkType,
      notice,
    }),
});

export const reserve = define({
  name: "orders.reserve",
  description:
    "Reserve parts for a build in the client. Takes references to earlier results; duplicates are removed. This changes application state.",
  input: z.object({ refs: z.array(ref(Parts)).min(1) }),
  output: Parts,
  effects: "write",
  examples: [{ input: { refs: ["$components"] } }, { input: { refs: ["$matches[2]"] } }],
  run: ({ input, ctx }) => {
    const seen = new Set<string>();
    const items = input.refs
      .flatMap((collection) => [...collection.items])
      .filter((part) => {
        if (seen.has(part.id)) return false;
        seen.add(part.id);
        return true;
      });
    ctx.reserved = items.map((part) => part.id);
    return items;
  },
});

export function supplyChainOperations() {
  return [
    findParts,
    components,
    usedIn,
    findLinks,
    bomPaths,
    reserve,
    ...standardOperations(Parts),
    ...standardOperations(Links),
  ];
}
