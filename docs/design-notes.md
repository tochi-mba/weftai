# Design notes

Running record of decisions and ideas. Each idea carries a status so nothing is silently dropped:
**adopted**, **planned**, **evaluating**, or **rejected** (with the reason).

## Decisions taken

- **References are strings.** `"$owned"`, `"$owned[2]"`, `"$owned[1,4,7]"`. They are only
  interpreted where an input field is declared with `ref()`, so plain string fields never treat a
  leading `$` specially. The model-facing JSON Schema shows the strict grammar; validation
  tolerates whitespace inside the brackets.
- **Results are session-scoped.** A result store keyed by session id, with a TTL and a cap,
  lets a later tool call reference an earlier call's result by name. That is the whole point of
  the Jigsaw `SelectTool { refs: ["owned"] }` flow.
- **Step schemas are closed.** A step with an unknown key (`operation` instead of `op`) is an
  error naming the key, never silently ignored.
- **Every operation has provenance.** A collection result is its own provenance; a count or a
  group can attach the entities it was computed from with `withSources`, and `sources` on the
  operation declares that statically so references to it can be type-checked before execution.
- **Presentation is inferred.** A step referenced by a later step in the same plan gets a
  preview; a terminal step gets the read budget. Steps and operations can override.
- **Hard caps error, soft caps notify.** The runtime never chops a result silently: a hard cap
  is an error asking the model to narrow the query; a soft cap inside an operation is a notice
  that the formatter must render.
- **Structured `toJSON()` on every error** is part of the public contract. Adapters and the MCP
  server can `JSON.stringify` an error without leaking a stack.
- **`formatPath` concatenates segments.** A leading numeric index is `input[0]`, never `input.[0]`.
- **Array summaries parenthesise top-level unions and intersections**, including `{A} & {B}`,
  using brace depth so `{ a: string | number }[]` stays unparenthesised.
- **No file over 1,000 lines.** Enforced by `tools/file-length.test.ts`.
- **The diagram example is the proposal's diagram.** Six entities with UUID-style ids, the four
  ownership edges and the cashflow edge, and the thirteen Appendix A scenarios as tests that
  assert the exact model-facing text. That suite, not an invented fixture, is the acceptance bar.
- **Fuzzy is not edit distance.** It tolerates casing, punctuation, whitespace and placeholder
  brackets in either direction. Edit distance made `Sub 1 Ltd` match `Sub 3 Ltd`, which turned a
  disambiguation scenario into a wrong answer.
- **Handlers choose displayed fields with `showFields`.** The formatter never sniffs plan input;
  `details` asks for `"all"` or the named fields, and `"all"` omits a field that repeats the label.
- **Provenance headers everywhere.** A count or a group with sources renders as
  `id (nodes): N matched`; only results with no entities behind them use the bare forms.
- **Two adapters in v0.1.** Anthropic tools wrap a plan schema (`strict: true` by default; session
  id shared across tool calls). MCP exposes `run_plan`, `describe_operations` and `get_result`.
- **Domain file contract.** Default export `{ registry, createContext(fixturePath?) }`. The CLI
  loads TypeScript through jiti and `pathToFileURL`.
- **`ref()` metadata uses `Symbol.for`.** A WeakMap is the fast path, but a global symbol on the
  schema means a second copy of `agentweft` (CLI + jiti, bundlers) can still see `$ref` fields.

## Ideas

| # | Idea | Status | Notes |
|---|------|--------|-------|
| 1 | Property-based tests (fast-check) for parser round trips, path helpers and validator robustness | adopted | The validator must never throw on arbitrary JSON; parsers must round-trip. |
| 2 | `explain` mode: return the dependency levels and per-step summaries without executing | planned | Cheap dry run for the CLI, debugging and a model self-check. |
| 3 | Prompt-injection hardening in the formatter | planned | Labels and properties come from user data and land in model-facing text. Strip newlines and control characters from labels, cap their length, and indent data lines so a label cannot forge a step header like `owned (nodes): 0 matched`. |
| 4 | Confirmation hook before `write` steps | planned | `beforeStep` can already veto; add a first-class `confirmWrites` option so human-in-the-loop is one flag. |
| 5 | Deterministic ordering contract | planned | Operations declare `ordering: "stable" | "unspecified"`; for unspecified results the runtime sorts by label then key so ordinals cannot drift between calls. |
| 6 | Token estimator plug-in | planned | Default chars/4; allow a real tokenizer. Budgets stay in tokens. |
| 7 | Tracing hooks shaped like OpenTelemetry spans | planned | No dependency; expose `onSpan(start, end, attributes)` so any exporter can attach. |
| 8 | Result-store adapters (Redis, encrypted) | evaluating | Interface first; in-memory store ships in v0.1. |
| 9 | Step result caching within a session | evaluating | Re-running an identical read step against an unchanged context could reuse the earlier result. Needs a `contextVersion(ctx)` hook to be safe. |
| 10 | `agentweft doctor`: lint a registry for DX problems | planned | Missing examples, descriptions under N words, operations whose names differ by one character, fields without descriptions. |
| 11 | Evaluation harness measuring round trips per scenario | planned | Turns the proposal's hand-counted "structural counts" into an automated metric. |
| 12 | Cost hints on operations (`cost: "cheap" | "expensive"`) rendered in descriptions | evaluating | Nudges the model toward cheap operations first. |
| 13 | Streaming step results as they finish | evaluating | `runtime.stream(plan)` as an async iterator for UIs. |
| 14 | Conditional steps (`when` guards) | rejected | Control flow that depends on inspecting a result belongs to the model; a batch finishes, returns, and accepts a continuation. |
| 15 | Plan format version field | rejected for now | Adds noise to every call; revisit when the format changes incompatibly. |
| 16 | Structured `toJSON()` on every error | adopted | Adapters and the MCP server need a stable error shape. |
| 17 | Benchmarks (`vitest bench`) for the walker and validator on large inputs | planned | Guards against accidental quadratic behaviour. |
| 18 | Message catalogue for model-facing strings | evaluating | Would allow localisation and A/B testing of phrasing without touching logic. |
