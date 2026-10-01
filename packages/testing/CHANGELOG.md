# @weftai/testing

## 0.6.0

### Patch Changes

- Updated dependencies [d7ad8a4]
  - weftai@0.6.0

## 0.5.2

### Patch Changes

- Updated dependencies [4eaab21]
- Updated dependencies [09413c4]
  - weftai@0.5.2

## 0.5.1

### Patch Changes

- c8b1779: Complete package pages. Every package links its source, home page and issues, lists keywords,
  and ships the licence in its tarball. The READMEs are rewritten: the core quick start runs as
  written and shows its real output, every link works from npm, and each package says how to
  install it and what it offers.
- Updated dependencies [c8b1779]
  - weftai@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies
  - weftai@0.5.0

## 0.4.0

### Patch Changes

- weftai@0.4.0

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
