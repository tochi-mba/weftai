# Concepts

Weftai runs a **plan**: a list of named steps a model emits in one tool call. Your application
validates the plan, executes the steps, and stores each result under its `id`. Later steps — and
later tool calls in the same session — refer to those results with `$id`. The data never goes
back through the model; the model only sees a formatted summary.

```json
{
  "steps": [
    {
      "id": "drone",
      "op": "parts.find",
      "input": { "filters": [{ "field": "label", "op": "fuzzy", "value": "Aurora Drone" }] }
    },
    {
      "id": "components",
      "op": "parts.components",
      "input": { "from": "$drone", "depth": "all" }
    },
    {
      "id": "taiwan",
      "op": "parts.filter",
      "input": {
        "from": "$components",
        "filters": [{ "field": "origin", "op": "eq", "value": "Taiwan" }]
      }
    }
  ]
}
```

That plan is the Taiwan scenario from `examples/supply-chain`, which ships a six-part bill of
materials. After execution the model sees exact counts (`1`, `3`, `2` matched), labels rather
than internal ids, and a preview notice on every intermediate step:

```
drone (parts): 1 matched
  1. Aurora Drone
  [intermediate step - preview only; reference $drone to use the full set]
components (parts): 3 matched
  1. Power Module
  2. Sensor Board
  3. Voltage Regulator
  [intermediate step - preview only; reference $components to use the full set]
taiwan (parts): 2 matched
  1. Sensor Board
  2. Voltage Regulator
```

## Pieces

| Piece | Role |
|-------|------|
| **Operation** | A named function with a Zod input schema, an output type (`collection`, `value`, or `groups`) and a handler. Defined once. |
| **Registry** | The set of operations a runtime may run. `describe()` and `planSchema()` are derived from it. |
| **Plan** | `{ steps: [{ id, op, input }] }`. Ids are unique within the plan. Independent steps run together. |
| **Runtime** | Validates, executes, stores, traces, formats. |
| **Result store** | Session-scoped. A later tool call can `$ref` an earlier call's result until TTL or the cap. |
| **Formatter** | Turns step results into the string the model reads. Truncation is never silent. |

## References

A field declared with `ref(Parts)` accepts a string:

- `$components` — the full result of step `components`
- `$components[2]` — the 2nd item (1-based)
- `$components[1,4,7]` — those three items, in that order

Positions always index the **full stored set**, not the lines the formatter happened to show.
Plain string fields never interpret a leading `$`.

## What the model is shown

- Collection steps: `components (parts): 3 matched` then numbered labels.
- Counts and groups keep their entities: `n (parts): 2 matched` then `  2`, and
  `byOrigin (parts): 6 matched` then `  Taiwan: 2` per group, `not recorded` last.
- Intermediate steps (referenced later in the same plan) get a smaller budget and
  `[intermediate step - preview only; reference $components to use the full set]`.
- Truncation adds `showing N of M` with the exact counts.
- Errors name the fix: unknown fields list available fields; unknown ops suggest the nearest name.
- Internal identifiers never appear.

## Caps

A **hard** cap (for example a filter that would return more items than `maxItems`) is an error
asking the model to narrow the query. A **soft** cap inside an operation is a notice the
formatter always renders. The stored result is never silently chopped.

## Sessions

Results live under a session id (default `"default"`). Reusing a step id replaces the previous
result and says so. The in-memory store expires entries after 30 minutes and keeps at most 200
per session, evicting the oldest with a notice.

## Structural counts

Until token or latency figures are measured on real transcripts, docs and READMEs talk about
**structural counts** (steps per question, tool calls per question), not token or latency
savings.
