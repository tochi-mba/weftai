# Concepts

Weftai runs a **plan**: a list of named steps a model emits in one tool call. Your application
validates the plan, executes the steps, and stores each result under its `id`. Later steps — and
later tool calls in the same session — refer to those results with `$id`. The data never goes
back through the model; the model only sees a formatted summary.

```json
{
  "steps": [
    {
      "id": "acme",
      "op": "nodes.find",
      "input": { "filters": [{ "field": "label", "op": "fuzzy", "value": "Corporate 1" }] }
    },
    {
      "id": "owned",
      "op": "nodes.descendants",
      "input": { "from": "$acme", "depth": "all" }
    },
    {
      "id": "delaware",
      "op": "nodes.filter",
      "input": {
        "from": "$owned",
        "filters": [{ "field": "Jurisdiction", "op": "eq", "value": "Delaware" }]
      }
    }
  ]
}
```

That plan is the Delaware scenario from `examples/diagram`, which ships the proposal's six-entity
test diagram. After execution the model sees exact counts (`1`, `3`, `2` matched), labels rather
than internal ids, and a preview notice on every intermediate step:

```
acme (nodes): 1 matched
  1. Corporate 1
  [intermediate step - preview only; reference $acme to use the full set]
owned (nodes): 3 matched
  1. Sub 1 Ltd
  2. Sub 2 Ltd
  3. Sub 3 Ltd
  [intermediate step - preview only; reference $owned to use the full set]
delaware (nodes): 2 matched
  1. Sub 2 Ltd
  2. Sub 3 Ltd
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

A field declared with `ref(Nodes)` accepts a string:

- `$owned` — the full result of step `owned`
- `$owned[2]` — the 2nd item (1-based)
- `$owned[1,4,7]` — those three items, in that order

Positions always index the **full stored set**, not the lines the formatter happened to show.
Plain string fields never interpret a leading `$`.

## What the model is shown

- Collection steps: `owned (nodes): 3 matched` then numbered labels.
- Counts and groups keep their entities: `n (nodes): 4 matched` then `  4`, and
  `byJurisdiction (nodes): 6 matched` then `  Delaware: 2` per group, `not recorded` last.
- Intermediate steps (referenced later in the same plan) get a smaller budget and
  `[intermediate step - preview only; reference $owned to use the full set]`.
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
