# Writing operations

Define each operation once. Weftai derives validation, the model-facing description, JSON
Schema, tracing and CLI support from that definition.

```ts
import { collection, defineOperation, ref, z } from "weftai";

const Part = z.object({
  id: z.string(),
  label: z.string(),
  partType: z.string(),
  origin: z.string().optional(),
});

const Parts = collection("parts", Part, {
  label: (p) => p.label,
  key: (p) => p.id,
  fields: () => [
    { name: "label", aliases: ["name"], get: (p) => p.label },
    { name: "partType", aliases: ["type"], get: (p) => p.partType },
    { name: "origin", aliases: ["country"], get: (p) => p.origin },
  ],
});

export const findParts = defineOperation({
  name: "parts.find",
  description: "Find catalog parts by filter. Use as the first step to resolve parts by name.",
  input: z.object({
    filters: z.array(z.object({
      field: z.string(),
      op: z.enum(["eq", "contains", "fuzzy"]).default("eq"),
      value: z.union([z.string(), z.number(), z.boolean()]),
    })).default([]),
  }),
  output: Parts,
  examples: [{ input: { filters: [{ field: "label", op: "fuzzy", value: "Aurora" }] } }],
  run: ({ input, ctx }) => ctx.catalog.parts.filter(/* … */),
});

export const components = defineOperation({
  name: "parts.components",
  description: "Walk the bill of materials down from the given parts.",
  input: z.object({
    from: ref(Parts),
    depth: z.union([z.int().min(1), z.literal("all")]).default("all"),
  }),
  output: Parts,
  run: ({ input, ctx }) => walkDown(ctx.catalog, input.from.items, input.depth),
});
```

Inside `run`, `input.from` is already a `{ items, count, type }` collection — not a string.

## Rules that are part of the product

- Names look like `collection.verb` (`parts.find`). Invalid names fail at definition time.
- Descriptions are one or two sentences for the model: what it does and when to use it.
- `label` is what the model sees. Never return an internal id as a label.
- A wrong field name is an error listing available fields, never an empty result. Use
  `resolveField` from `weftai`.
- Call `notice("…")` whenever a cap or budget shortens or shapes the result. The formatter
  always renders notices.
- Call `showFields(["origin"])` or `showFields("all")` when the model should see properties next
  to each label. Absent values render as `not recorded`.
- `matchesFilter` implements `eq`, `ne`, `contains`, `startsWith`, `gt`, `gte`, `lt`, `lte` and
  `fuzzy`. Fuzzy tolerates casing, punctuation, whitespace and placeholder brackets in either
  direction; it is never an edit-distance match, so `Sensor Board` does not match `Sensor Bracket`.
- `effects: "write"` marks operations that change application state. Read-only tools can exclude
  them with `registry.filter(op => op.effects === "read")`.

## Standard operations

`standardOperations(Parts)` adds `parts.filter`, `.count`, `.countBy`, `.distinct`, `.mostCommon`,
`.first`, `.pick` (by 1-based ordinals) and `.details`. They all resolve field names against
`Parts.fields(ctx)`. Pass `{ include: ["filter", "count"] }` or `{ maxItems: 200 }` to opt in
selectively; exceeding `maxItems` is a hard error (`Narrow the query.`).

## Registry and runtime

```ts
import { createRegistry, createRuntime } from "weftai";

const registry = createRegistry({ operations: [findParts, components, ...standardOperations(Parts)] });
const runtime = createRuntime({ registry });
const result = await runtime.execute(plan, { ctx, session: { id: conversationId } });
result.text;  // model-facing string
result.trace; // JSON for the CLI / inspector
```

`defineOperationFor<Ctx>()` binds the context type so each operation in a domain does not
repeat it.

## Provenance

A collection result is its own provenance: `$countStep` can still resolve to the items that were
counted when the operation sets `sources: Parts` and returns `withSources(n, Parts, items)`.
`parts.count` from `standardOperations` does this.
