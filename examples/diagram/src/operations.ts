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
import { edgeFields, nodeFields } from "./fields.js";
import { findPaths, involving, walkAncestors, walkDescendants } from "./graph.js";
import { type DiagramContext, DiagramEdge, DiagramNode, DiagramPath } from "./types.js";

const FilterClause = z.object({
  field: z.string(),
  op: z.enum(FILTER_OPS).default("eq"),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const Depth = z.union([z.int().min(1), z.literal("all"), z.literal("ultimate")]);

export const Nodes = collection("nodes", DiagramNode, {
  label: (n) => n.label,
  key: (n) => n.id,
  fields: () => nodeFields(),
  description: "Entities on the diagram: companies, trusts, people.",
});

export const Edges = collection("edges", DiagramEdge, {
  label: (e) =>
    `${e.fromLabel} to ${e.toLabel} (${e.relationshipType}${e.label === "" ? "" : ` ${e.label}`})`,
  key: (e) => e.id,
  fields: () => edgeFields(),
  description: "Relationships between two entities, such as 75% ownership.",
});

export const Paths = collection("paths", DiagramPath, {
  label: (p) => p.label,
  key: (p) => p.id,
  description: "Routes between two entities with hop counts and effective ownership.",
});

const define = defineOperationFor<DiagramContext>();

function keep<T>(
  type: typeof Nodes | typeof Edges,
  items: readonly T[],
  filters: readonly Filter[],
  ctx: DiagramContext,
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

export const findNodes = define({
  name: "nodes.find",
  description:
    "Find diagram entities by filter (label, entityType, Jurisdiction). Use as the first step to resolve entities by name; fuzzy matching tolerates casing.",
  input: z.object({ filters: z.array(FilterClause).default([]) }),
  output: Nodes,
  examples: [{ input: { filters: [{ field: "label", op: "fuzzy", value: "Corporate 1" }] } }],
  run: ({ input, ctx, step }) =>
    keep(Nodes, ctx.diagram.nodes, input.filters, ctx, step.id, "nodes.find"),
});

export const descendants = define({
  name: "nodes.descendants",
  description:
    "Everything the given entities own, walking ownership edges down. edgeType defaults to Ownership so cashflow edges do not leak in.",
  input: z.object({
    from: ref(Nodes),
    depth: Depth.default("all"),
    edgeType: z.string().default("Ownership"),
  }),
  output: Nodes,
  examples: [{ input: { from: "$acme", depth: "all" } }],
  run: ({ input, ctx }) =>
    walkDescendants(
      ctx.diagram,
      input.from.items,
      input.depth === "ultimate" ? "all" : input.depth,
      input.edgeType,
    ),
});

export const ancestors = define({
  name: "nodes.ancestors",
  description:
    "Who owns the given entities, walking ownership edges up. depth 'ultimate' keeps only owners that nothing else owns (the ultimate beneficial owners).",
  input: z.object({
    from: ref(Nodes),
    depth: Depth.default("all"),
    edgeType: z.string().default("Ownership"),
  }),
  output: Nodes,
  examples: [{ input: { from: "$target", depth: "ultimate" } }],
  run: ({ input, ctx }) =>
    walkAncestors(ctx.diagram, input.from.items, input.depth, input.edgeType),
});

export const findEdges = define({
  name: "edges.find",
  description:
    "Find relationships. 'involving' keeps edges where an entity is source or target; filters can use percentage (an alias for the ownership label), relationshipType, from and to.",
  input: z.object({
    filters: z.array(FilterClause).default([]),
    involving: ref(Nodes).optional(),
  }),
  output: Edges,
  examples: [
    { input: { involving: "$sub" } },
    { input: { filters: [{ field: "percentage", op: "eq", value: "50%" }] } },
  ],
  run: ({ input, ctx, step }) => {
    const edges =
      input.involving === undefined
        ? ctx.diagram.edges
        : involving(ctx.diagram, input.involving.items);
    return keep(Edges, edges, input.filters, ctx, step.id, "edges.find");
  },
});

export const graphPaths = define({
  name: "graph.paths",
  description:
    "How two sets of entities are related: every route between them with hop counts and effective ownership. Spans all edge types unless edgeType is given. Depth and pair caps are reported as notices.",
  input: z.object({
    from: ref(Nodes),
    to: ref(Nodes),
    edgeType: z.string().optional(),
  }),
  output: Paths,
  examples: [{ input: { from: "$corps", to: "$trusts" } }],
  run: ({ input, ctx, notice }) =>
    findPaths(ctx.diagram, {
      from: input.from.items,
      to: input.to.items,
      edgeType: input.edgeType,
      notice,
    }),
});

export const select = define({
  name: "selection.select",
  description:
    "Select entities in the client. Takes references to earlier results; duplicates are removed. This changes application state.",
  input: z.object({ refs: z.array(ref(Nodes)).min(1) }),
  output: Nodes,
  effects: "write",
  examples: [{ input: { refs: ["$owned"] } }, { input: { refs: ["$matches[2]"] } }],
  run: ({ input, ctx }) => {
    const seen = new Set<string>();
    const items = input.refs
      .flatMap((collection) => [...collection.items])
      .filter((node) => {
        if (seen.has(node.id)) return false;
        seen.add(node.id);
        return true;
      });
    ctx.selected = items.map((node) => node.id);
    return items;
  },
});

export function diagramOperations() {
  return [
    findNodes,
    descendants,
    ancestors,
    findEdges,
    graphPaths,
    select,
    ...standardOperations(Nodes),
    ...standardOperations(Edges),
  ];
}
