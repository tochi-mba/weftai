# Plan format

The wire format is a JSON object the model produces as a single tool input:

```json
{ "steps": [{ "id": "drone", "op": "parts.find", "input": { } }] }
```

Unknown keys on a step (`operation` instead of `op`) are an error naming the key, never ignored.

## Fields

| Field | Required | Meaning |
|-------|----------|---------|
| `steps` | yes | Non-empty array of steps. |
| `steps[].id` | yes | Result name. `^[A-Za-z_][A-Za-z0-9_]{0,63}$`, unique in the plan. |
| `steps[].op` | yes | Operation name such as `parts.find`. |
| `steps[].input` | no | Object of arguments. Missing input is `{}`. |
| `steps[].present` | no | `auto` (default), `preview`, or `full`. See [Formatting](formatting.md#presentation). |
| `steps[].note` | no | One plain sentence, at most 200 characters (`NOTE_MAX_CHARS`), saying what the step is for, written for a person. Never executed and never shown back to the model; it is on the validated step, the step result, the trace and every hook, for a host's approval prompt, progress line or log. |

## JSON Schema for the model

`registry.planSchema({ style: "union", strict: true })` emits one variant per operation with that
operation's input schema, `additionalProperties: false`, and every property required — suitable
for Anthropic `strict: true`. `style: "loose"` is a smaller schema: `op` is an enum and `input`
is a free-form object. The defaults are `style: "union"` and `strict: false`; `maxSteps` adds a
`maxItems` bound to `steps`.

The Zod `PlanSchema` (re-exported from `weftai`) is the loose runtime shape. Adapters parse
with it, then `runtime.execute` validates operation inputs and references.

## Validation issues

`validatePlan(plan, registry, options?)` returns `{ ok: true, plan }`, a typed plan with
dependency levels, or `{ ok: false, issues }`, a list of `PlanIssue` values. Each issue has a
`code`, a one-sentence `message`, and where they apply a `stepId`, a `path` inside the step input
and a `hint` naming the fix. `options` takes `maxSteps`, `allowWrites` and a `session` view of
stored results; `runtime.execute` passes all three.

If a plan has any issue, no step runs: the model reads every issue at once and can correct them
in one reply. The codes are the `IssueCode` type:

| Code | Reported when |
|------|---------------|
| `plan.invalid_shape` | The input is not `{ steps: [...] }` with at least one step, a step lacks `id` or `op`, or a step has an unknown key. Reported on its own. |
| `plan.too_many_steps` | The plan has more steps than `maxSteps` (the runtime's default is 20). |
| `step.invalid_id` | A step id does not match the pattern above. |
| `step.duplicate_id` | Two steps in the plan share an id. |
| `step.unknown_operation` | `op` names no registered operation, or one outside the tool's scope. The hint is "Did you mean …?" when a name is close, otherwise the list of operations. |
| `step.write_not_allowed` | The step uses an `effects: "write"` operation and `allowWrites` is `false`. |
| `step.invalid_input` | The input does not match the operation's schema. One issue per problem, rewritten as a plain sentence; the hint shows the expected input. |
| `ref.invalid_syntax` | A `ref()` field holds a malformed reference, such as `$drone[0]` (positions are 1-based). |
| `ref.self_reference` | A step references itself. |
| `ref.forward_reference` | A step references a step that comes later in the plan. |
| `ref.unknown_target` | No earlier step and no stored result has that name. The hint suggests the nearest one. |
| `ref.type_mismatch` | The target holds a different collection (`$components` is `parts` but the field wants `links`), or has no entities to reference. |
| `ref.ordinal_out_of_range` | A position is beyond the size of a result stored by an earlier call. Positions into a step of the same plan are checked when the referencing step runs. |
| `ref.in_plain_field` | A whole reference such as `$drone`, naming a step in the plan or a stored result, is written into a field that is not declared with `ref()`. It would reach the operation as the text `$drone`. Text that only looks like a reference (`$HOME`, `costs $5`) is passed as written. |

Refs to results stored from **earlier calls** in the same session are valid. Refs to later steps
in this plan are not.

## Execution

Independent reads (no `$ref` between them) run in parallel, bounded by `limits.maxParallel`
(default 4). A step whose operation has `effects: "write"` runs on its own, in the order the plan
wrote it: after every step written before it, and before any step written after it starts. Two
writes therefore never overlap, and a read written after a write sees what the write did. That
ordering is not a reference, so a failed write does not skip the steps after it.

A failed step skips its dependents with `Skipped because step 'x' failed.` Other branches still
finish unless the runtime is created with `failure: "abort"`.

Each step has a timeout (`limits.stepTimeoutMs`, default 10 seconds) and the whole plan has one
(`limits.planTimeoutMs`, default 60 seconds). `limits.maxSteps` defaults to 20. The defaults are
exported as `DEFAULT_LIMITS`:

```ts
import { createRuntime } from "weftai";

const runtime = createRuntime({
  registry,
  limits: { maxSteps: 20, stepTimeoutMs: 10_000, planTimeoutMs: 60_000, maxParallel: 4 },
  failure: "continue", // or "abort": the first failure cancels running steps and skips the rest
});
```

An `AbortSignal` passed as `execute(plan, { ctx, signal })` cancels the remaining work, and steps
that had not started are reported as skipped. Each handler receives a `signal` that aborts on
cancellation, on the plan timeout, or on its own step timeout.
