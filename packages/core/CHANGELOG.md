# weftai

## 0.3.0

### Minor Changes

- Re-synced with the Python `weftai` package, which moves to 0.3.0 in the same release.
  `tools/surface.json` records the version both must carry and a test on each side asserts it.
- **`weftai/decisions`**: typed questions with closed answer sets, for the small judgements an
  agent host makes hundreds of times a turn and currently makes with regexes and thresholds.

  `noul()`, `choice()` and `score()` beside `value()` and `collection()`; an `Answers` reader
  whose every accessor takes a fallback; a `Decider` interface and a `NullDecider` that answers
  nothing. `Batch` collects a turn's questions into one round trip. `Gate` carries a threshold
  and the verdict to use when it is not met, and `Gate.tighten` composes verdicts in one
  direction only, so a probabilistic call can sit beside an authority decision without being
  able to grant anything. `Calibration` applies a temperature per answer kind, because the
  published error runs in opposite directions for yes/no answers and for choices.

  `Decomposition` is the one that matters most: a judgement split into atomic questions and
  recombined with fitted weights. A composite question answered once is the shape that measures
  worst, so `choice()` adds an abstain option unless refused and the builders reject a prompt
  containing two questions.

  The wording, the thresholds and the authority stay with the host. No new dependency.

## 0.2.5

### Patch Changes

- Re-synced with the Python `weftai` package. The two are one library with two
  implementations, and they had drifted to npm 0.2.1 against PyPI 0.2.4 with nothing
  comparing them. `tools/surface.json` now records the version both must carry, and a test
  on each side asserts its own packaging against it, so the lines cannot separate unnoticed
  again.
- `tools/surface.json` also records every name both packages export and every difference one
  language forces on the other, each with its reason. `tools/surface.parity.test.ts` enforces
  it here and `tools/test_surface_parity.py` enforces it in the Python repository, reading
  the same file. Nothing compared the two public surfaces before, which is how the Python
  root came to sit fifty type names behind this one for four releases.

  Fifteen names stay TypeScript-only on purpose: `z`, and the fourteen
  `z.output<typeof Schema>` aliases that zod requires and pydantic does not, because there
  the model class is already the type.

## 0.2.1

### Patch Changes

- 8233fe9: Use the supply-chain domain in the published README examples and in the `CollectionType` doc
  comment, so every shipped example matches the reference domain the test suites use.

## 0.2.0

### Minor Changes

- 031b2b4: Add wire-format provider families and a model capability catalog, and fold Claude tools into `@weftai/providers/anthropic`.

## 0.1.1

### Patch Changes

- 7940f89: Preserve record value schemas in strict JSON schema output so valid record entries are accepted.
  
  Keep truncation counts accurate when both per-step and total response budgets apply.

## 0.1.0

### Minor Changes

- 9b9b491: Initial public API: core runtime, Anthropic and MCP adapters, CLI, and test helpers.
