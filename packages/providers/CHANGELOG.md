# @weftai/providers

## 0.2.5

### Patch Changes

- Re-synced with the Python `weftai` package. The two are one library with two
  implementations, and they had drifted to npm 0.2.1 against PyPI 0.2.4 with nothing
  comparing them. `tools/surface.json` now records the version both must carry, and a test
  on each side asserts its own packaging against it, so the lines cannot separate unnoticed
  again.

## 0.2.1

### Patch Changes

- 8233fe9: Use the supply-chain domain in the published README examples and in the `CollectionType` doc
  comment, so every shipped example matches the reference domain the test suites use.
- caa1313: Stop publishing `dist/fixture.js`. It is the shared test fixture, it was never reachable through
  the package exports, and it built a runtime and registry that no consumer could use.
- Updated dependencies [8233fe9]
  - weftai@0.2.1

## 0.2.0

### Minor Changes

- 031b2b4: Add wire-format provider families and a model capability catalog, and fold Claude tools into `@weftai/providers/anthropic`.

### Patch Changes

- Updated dependencies [031b2b4]
  - weftai@0.2.0
