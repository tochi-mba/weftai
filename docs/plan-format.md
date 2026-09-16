# Plan format

The wire format is a JSON object the model produces as a single tool input:

```json
{ "steps": [{ "id": "acme", "op": "nodes.find", "input": { } }] }
```

Unknown keys on a step (`operation` instead of `op`) are an error naming the key, never ignored.

## Fields

| Field | Required | Meaning |
|-------|----------|---------|
| `steps` | yes | Non-empty array of steps. |
| `steps[].id` | yes | Result name. `^[A-Za-z_][A-Za-z0-9_]{0,63}$`, unique in the plan. |
| `steps[].op` | yes | Operation name such as `nodes.find`. |
| `steps[].input` | no | Object of arguments. Missing input is `{}`. |
| `steps[].present` | no | `auto` (default), `preview`, or `full`. |

## JSON Schema for the model

`registry.planSchema({ style: "union", strict: true })` emits one variant per operation with that
operation's input schema, `additionalProperties: false`, and every property required — suitable
for Anthropic `strict: true`. `style: "loose"` is a smaller schema: `op` is an enum and `input`
is a free-form object.

The Zod `PlanSchema` (re-exported from `agentweft`) is the loose runtime shape. Adapters parse
with it, then `runtime.execute` validates operation inputs and references.

## Validation issues

`validatePlan(plan, registry)` returns either a typed plan (with dependency levels) or a list of
`PlanIssue` values. Every issue is a sentence. Typical codes:

- `step.unknown_operation` — includes a "Did you mean …?" hint when close
- `ref.unknown_target` / `ref.forward_reference` / `ref.self_reference`
- `ref.type_mismatch` — `$owned` is `nodes` but the field wanted `edges`
- `step.invalid_input` — Zod issues rewritten as plain sentences
- `step.write_not_allowed` — a write op in a read-only tool
- `plan.too_many_steps`

Refs to results stored from **earlier calls** in the same session are valid. Refs to later steps
in this plan are not.

## Execution

Independent steps (no `$ref` between them) run in parallel, bounded by `maxParallel` (default 4).
A failed step skips its dependents with `Skipped because step 'x' failed.` Other branches still
finish unless `failure: "abort"`.

Each step has a timeout (`stepTimeoutMs`, default 10s) and the whole plan has `planTimeoutMs`
(default 60s). An external `AbortSignal` cancels remaining work.
