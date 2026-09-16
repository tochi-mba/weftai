# @weftai/providers

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
