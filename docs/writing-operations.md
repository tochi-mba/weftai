# Writing operations

Define each operation once. Weftai derives validation, the model-facing description, JSON
Schema, tracing and CLI support from that definition.

```ts
import { collection, defineOperation, ref, z } from "weftai";

const Node = z.object({
  id: z.string(),
  label: z.string(),
  entityType: z.string(),
  properties: z.record(z.string(), z.unknown()),
});

const Nodes = collection("nodes", Node, {
  label: (n) => n.label,
  key: (n) => n.id,
  fields: () => [
    { name: "label", aliases: ["name"], get: (n) => n.label },
    { name: "entityType", aliases: ["type"], get: (n) => n.entityType },
    { name: "Jurisdiction", get: (n) => n.properties.Jurisdiction },
  ],
});

export const findNodes = defineOperation({
  name: "nodes.find",
  description: "Find diagram nodes by filter. Use as the first step to resolve entities by label.",
  input: z.object({
    filters: z.array(z.object({
      field: z.string(),
      op: z.enum(["eq", "contains", "fuzzy"]).default("eq"),
      value: z.union([z.string(), z.number(), z.boolean()]),
    })).default([]),
  }),
  output: Nodes,
  examples: [{ input: { filters: [{ field: "label", op: "fuzzy", value: "Acme" }] } }],
  run: ({ input, ctx }) => ctx.diagram.nodes.filter(/* … */),
});

export const descendants = defineOperation({
  name: "nodes.descendants",
  description: "Walk ownership down from the given nodes.",
  input: z.object({
    from: ref(Nodes),
    depth: z.union([z.int().min(1), z.literal("all")]).default("all"),
  }),
  output: Nodes,
  run: ({ input, ctx }) => walkDown(ctx.diagram, input.from.items, input.depth),
});
```

Inside `run`, `input.from` is already a `{ items, count, type }` collection — not a string.

## Rules that are part of the product

- Names look like `collection.verb` (`nodes.find`). Invalid names fail at definition time.
- Descriptions are one or two sentences for the model: what it does and when to use it.
- `label` is what the model sees. Never return an internal id as a label.
- A wrong field name is an error listing available fields, never an empty result. Use
  `resolveField` from `weftai`.
- Call `notice("…")` whenever a cap or budget shortens or shapes the result. The formatter
  always renders notices.
- Call `showFields(["Jurisdiction"])` or `showFields("all")` when the model should see
  properties next to each label. Absent values render as `not recorded`.
- `matchesFilter` implements `eq`, `ne`, `contains`, `startsWith`, `gt`, `gte`, `lt`, `lte` and
  `fuzzy`. Fuzzy tolerates casing, punctuation, whitespace and placeholder brackets in either
  direction; it is never an edit-distance match, so `Sub 1 Ltd` does not match `Sub 3 Ltd`.
- `effects: "write"` marks operations that change application state. Read-only tools can exclude
  them with `registry.filter(op => op.effects === "read")`.

## Standard operations

`standardOperations(Nodes)` adds `nodes.filter`, `.count`, `.countBy`, `.distinct`, `.mostCommon`,
`.first`, `.pick` (by 1-based ordinals) and `.details`. They all resolve field names against
`Nodes.fields(ctx)`. Pass `{ include: ["filter", "count"] }` or `{ maxItems: 200 }` to opt in
selectively; exceeding `maxItems` is a hard error (`Narrow the query.`).

## Registry and runtime

```ts
import { createRegistry, createRuntime } from "weftai";

const registry = createRegistry({ operations: [findNodes, descendants, ...standardOperations(Nodes)] });
const runtime = createRuntime({ registry });
const result = await runtime.execute(plan, { ctx, session: { id: conversationId } });
result.text;  // model-facing string
result.trace; // JSON for the CLI / inspector
```

`defineOperationFor<Ctx>()` binds the context type so each operation in a domain does not
repeat it.

## Provenance

A collection result is its own provenance: `$countStep` can still resolve to the items that were
counted when the operation sets `sources: Nodes` and returns `withSources(n, Nodes, items)`.
`nodes.count` from `standardOperations` does this.
