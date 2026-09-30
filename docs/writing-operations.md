# Writing operations

Define each operation once. Weftai derives validation, the model-facing description, JSON
Schema, tracing and CLI support from that definition.

```ts
import {
  collection,
  defineOperationFor,
  FILTER_OPS,
  matchesFilter,
  ref,
  resolveField,
  z,
} from "weftai";

const Part = z.object({
  id: z.string(),
  label: z.string(),
  partType: z.string(),
  origin: z.string().optional(),
});
type Part = z.infer<typeof Part>;

interface Catalog {
  readonly parts: readonly Part[];
  readonly contains: readonly { readonly parent: string; readonly child: string }[];
}
interface Ctx {
  readonly catalog: Catalog;
}

export const Parts = collection("parts", Part, {
  label: (p) => p.label,
  key: (p) => p.id,
  fields: () => [
    { name: "label", aliases: ["name"], get: (p) => p.label },
    { name: "partType", aliases: ["type"], get: (p) => p.partType },
    { name: "origin", aliases: ["country"], get: (p) => p.origin },
  ],
});

const define = defineOperationFor<Ctx>();

export const findParts = define({
  name: "parts.find",
  description: "Find catalog parts by filter. Use as the first step to resolve parts by name.",
  input: z.object({
    filters: z
      .array(
        z.object({
          field: z.string(),
          op: z.enum(FILTER_OPS).default("eq"),
          value: z.union([z.string(), z.number(), z.boolean()]),
        }),
      )
      .default([]),
  }),
  output: Parts,
  examples: [{ input: { filters: [{ field: "label", op: "fuzzy", value: "Aurora" }] } }],
  run: ({ input, ctx }) => {
    const checks = input.filters.map((filter) => {
      const resolved = resolveField(Parts, filter.field, ctx);
      if (!resolved.ok) throw new Error(resolved.message); // lists the available fields
      return { filter, get: resolved.field.get };
    });
    return ctx.catalog.parts.filter((part) =>
      checks.every(({ filter, get }) => matchesFilter(get(part), filter)),
    );
  },
});

export const components = define({
  name: "parts.components",
  description: "Walk the bill of materials down from the given parts.",
  input: z.object({
    from: ref(Parts),
    depth: z.union([z.int().min(1), z.literal("all")]).default("all"),
  }),
  output: Parts,
  run: ({ input, ctx }) => {
    const { parts, contains } = ctx.catalog;
    const found = new Set<string>();
    let frontier = input.from.items.map((part) => part.id);
    for (let level = 1; frontier.length > 0; level++) {
      if (input.depth !== "all" && level > input.depth) break;
      frontier = contains
        .filter((link) => frontier.includes(link.parent) && !found.has(link.child))
        .map((link) => link.child);
      for (const id of frontier) found.add(id);
    }
    return parts.filter((part) => found.has(part.id));
  },
});
```

`collection(name, itemSchema, options)` declares what a collection-returning operation produces:
`label` is what the model reads for each item, `key` identifies an item (it defaults to the
label), and `fields` lists the properties the model may filter, group and show, each with
optional `aliases` and a `description`. Collection names are short lowerCamelCase plurals.

`defineOperationFor<Ctx>()` binds the context type once, so every operation in a domain sees
`ctx` typed without repeating it. `defineOperation` is the same function with the context type
as a type parameter.

Inside `run`, `input.from` is already a `{ items, count, type }` collection — not a string. The
handler receives one object with:

| Property | What it is |
|----------|------------|
| `input` | The validated input, defaults applied, every `ref()` field resolved. |
| `ctx` | The application context passed to `execute`. |
| `signal` | An `AbortSignal` that fires on cancellation or timeout. |
| `step` | `{ id, operation }` of the step being run. |
| `notice(message)` | Adds a notice the formatter always renders under this step. |
| `showFields(names)` | Asks the formatter to show named fields, or `"all"`, next to each label. |

A handler may be `async`. It returns data of its output type: an array of items for a
collection, a value matching the schema passed to `value(schema)`, or `{ key, count }[]` for
`groups()`. Throwing fails the step; the message reaches the model, so make it name the fix.

## Rules that are part of the product

- Names look like `collection.verb` (`parts.find`): lowerCamelCase segments joined by dots.
  Invalid names fail at definition time with a `DefinitionError`, as do an empty description, a
  non-object input schema, and an example that does not match the input schema.
- Descriptions are one or two sentences for the model: what it does and when to use it.
- `label` is what the model sees. Never return an internal id as a label.
- A wrong field name is an error listing available fields, never an empty result. Use
  `resolveField` from `weftai`: it returns `{ ok: true, field }` or `{ ok: false, message }`, and
  the message lists the available fields and the nearest name.
- Call `notice("…")` whenever a cap or budget shortens or shapes the result. The formatter
  always renders notices.
- Call `showFields(["origin"])` or `showFields("all")` when the model should see properties next
  to each label. Absent values render as `not recorded`.
- `matchesFilter` implements `eq`, `ne`, `contains`, `startsWith`, `gt`, `gte`, `lt`, `lte` and
  `fuzzy` (the list is exported as `FILTER_OPS`). Fuzzy tolerates casing, punctuation, whitespace
  and placeholder brackets in either direction; it is never an edit-distance match, so
  `Sensor Board` does not match `Sensor Bracket`.
- `effects: "write"` marks operations that change application state. Read-only tools can exclude
  them with `registry.filter(op => op.effects === "read")`, or with an `include` predicate on
  `execute` or an adapter tool. A write step runs on its own, in plan order, never beside another
  step (see [Plan format](plan-format.md#execution)).

## Standard operations

`standardOperations(Parts)` adds `parts.filter`, `.count`, `.countBy`, `.distinct`, `.mostCommon`,
`.first`, `.pick` (by 1-based ordinals) and `.details`. They all resolve field names against
`Parts.fields(ctx)`. Pass `{ include: ["filter", "count"] }` to add only some of them. Pass
`{ maxItems: 200 }` to cap what `filter`, `distinct` and `details` may return; there is no cap by
default, and exceeding one is a hard error that ends with `Narrow the query.`

## Registry and runtime

```ts
import { createRegistry, createRuntime, standardOperations } from "weftai";

const registry = createRegistry({ operations: [findParts, components, ...standardOperations(Parts)] });
const runtime = createRuntime({ registry });
const result = await runtime.execute(plan, { ctx, session: { id: conversationId } });
result.ok;    // false if validation failed or any step failed or was skipped
result.text;  // model-facing string
result.trace; // JSON for the CLI / inspector
```

`createRegistry` refuses two operations with the same name. `createRuntime` also accepts:

| Option | Default | Meaning |
|--------|---------|---------|
| `store` | `createMemoryStore()` | Where results live between calls. See [Sessions](concepts.md#sessions). |
| `limits` | `DEFAULT_LIMITS` | `maxSteps`, `stepTimeoutMs`, `planTimeoutMs`, `maxParallel`. See [Execution](plan-format.md#execution). |
| `failure` | `"continue"` | `"abort"` cancels the rest of the plan at the first failed step. |
| `formatter` | `createFormatter()` | See [Formatting](formatting.md). |
| `hooks` | none | `beforeStep`, `afterStep` and `onStepError`, each called with `{ step, ctx, signal }` plus `result` or `error`. A `beforeStep` that throws fails the step, so it can veto one. |

`execute(plan, options)` takes `ctx` (required), `session` (`{ id }`, default `"default"`),
`signal`, `allowWrites` and `include` (a predicate that limits which operations this call may use).

## Provenance

A collection result is its own provenance: `$countStep` can still resolve to the items that were
counted when the operation sets `sources: Parts` and returns `withSources(n, Parts, items)`.
`parts.count` from `standardOperations` does this.
