# weftai

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
