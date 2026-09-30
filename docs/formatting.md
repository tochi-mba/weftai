# Formatting

The formatter turns `ExecutionResult.steps` into the string the model reads. It never truncates
silently: every shortened body includes `showing N of M` with the exact counts, and ordinals
still index the full stored set.

## Budgets

```ts
import { createFormatter } from "weftai";

const formatter = createFormatter({
  budgets: { read: 2000, preview: 400, total: 8000 }, // tokens; defaults
  estimateTokens: (text) => Math.ceil(text.length / 4),
});
```

- **read** — terminal steps (not referenced later in this plan).
- **preview** — steps a later step in this plan `$ref`s, unless `present` overrides.
- **total** — ceiling for the whole response. Headers are always kept; body lines are trimmed
  from the last step backwards, each shortened step gets `showing N of M`, and the last step gets
  `Shown headers for all N steps; bodies truncated to the total budget of T tokens.`

`DEFAULT_BUDGETS` holds those defaults; `budgets` may override any subset. Pass the formatter
into `createRuntime({ registry, formatter })`. Replace `estimateTokens` with
a real tokenizer when you measure; until then the default is characters/4.

## Presentation

| `present` | What the model sees |
|-----------|---------------------|
| `auto` (default) | Preview if referenced in this plan, otherwise read. |
| `preview` | Preview budget. |
| `full` | Read budget. |

Per-step `present` on the plan overrides the operation default.

## Rendering rules

- Collection: `components (parts): 3 matched` then `  1. Label`.
- Details: `  1. Aurora Drone - partType: Assembly; origin: Germany`. A handler asks for this
  with `showFields(["origin"])` or `showFields("all")`; with `"all"` a field that merely repeats
  the label is omitted.
- Groups with provenance: `by (parts): 6 matched` then `  Taiwan: 2` per group, in the order the
  handler returned them (`countBy` returns the most common first and `not recorded` last).
  Without provenance: `by (groups): 2 groups`.
- Value with provenance: `n (parts): 2 matched` then `  2`. Without: `n: 5` then `  5`.
- Error: `drone: failed` then the message (which already names the fix).
- Skipped: `taiwan: skipped` then `Skipped because step 'components' failed.`
- Intermediate: `[intermediate step - preview only; reference $components to use the full set]`.
- Missing properties render as `not recorded`.
- Labels and property values are sanitised so a value cannot forge a step header: control
  characters and newlines become spaces, runs of whitespace collapse to one, a value longer than
  120 characters is cut to 119 and ends with `…`, and an empty label renders as `(unnamed)`.
  `sanitizeLabel` and `formatProperty` are exported for handlers that build their own text.
- Internal ids are not printed.

## Notices

Anything that shortened a result — a search-depth cap, a distinct-values summary, a replaced
step id, a session eviction, a token-budget cut — is a notice under that step. Tests should
assert the rendered string, not only the structured `notices` array.
