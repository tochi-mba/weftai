# @weftai/testing

## 0.3.0

### Minor Changes

- Re-synced with the Python `weftai` package, which moves to 0.3.0 in the same release.
  `tools/surface.json` records the version both must carry and a test on each side asserts it.

## 0.2.5

### Patch Changes

- Re-synced with the Python `weftai` package. The two are one library with two
  implementations, and they had drifted to npm 0.2.1 against PyPI 0.2.4 with nothing
  comparing them. `tools/surface.json` now records the version both must carry, and a test
  on each side asserts its own packaging against it, so the lines cannot separate unnoticed
  again.

## 0.2.1

### Patch Changes

- Updated dependencies [8233fe9]
  - weftai@0.2.1

## 0.2.0

### Minor Changes

- 031b2b4: Add wire-format provider families and a model capability catalog, and fold Claude tools into `@weftai/providers/anthropic`.

### Patch Changes

- Updated dependencies [031b2b4]
  - weftai@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [7940f89]
  - weftai@0.1.1

## 0.1.0

### Minor Changes

- 9b9b491: Initial public API: core runtime, Anthropic and MCP adapters, CLI, and test helpers.

### Patch Changes

- Updated dependencies [9b9b491]
  - weftai@0.1.0
