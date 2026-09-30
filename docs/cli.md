# CLI

`weftai` (the `@weftai/cli` package) runs a domain against saved plans with no model in the loop.

A domain file default-exports `{ registry, createContext(fixturePath?) }`, or exports `registry`
and `createContext` by name. `createContext` may be async. TypeScript files load through jiti;
paths go through `pathToFileURL` so Windows drive letters work.

```
weftai run <plan.json> --domain <file> [--fixture <file>] [--trace out.json] [--format text|json]
weftai validate <plan.json> --domain <file>
weftai describe --domain <file> [--json]
weftai trace <trace.json>
weftai mcp --domain <file> [--fixture <file>] [--name <name>]
weftai init [dir]
```

Exit codes: `0` ok, `1` failed (a plan issue or a failed step), `2` usage.

## Examples

Components sourced from Taiwan, from the repo root:

```
weftai run examples/supply-chain/plans/taiwan-components.json --domain examples/supply-chain/src/domain.ts --trace out.json
weftai trace out.json
```

Expect three steps with counts 1 / 3 / 2: the Aurora Drone, the three parts it is built from,
and the two that originate in Taiwan. The fixture is the sample bill of materials, so every
scenario in `examples/supply-chain/src/scenarios.test.ts` can be replayed with `run` against
`examples/supply-chain/src/domain.ts`.

`run` prints the model-facing text; `--format json` prints `{ ok, text, durationMs, steps, trace }`
instead, and `--trace` writes the trace to a file that `trace` renders as a table. `validate`
reports plan issues (unknown op, bad `$ref`, malformed shape) without running handlers; it has
no stored results, so a reference to an earlier call's result is reported as unknown. `describe`
prints the model-facing operation list; `--json` prints the union plan schema (strict).

`mcp` serves the domain over stdio as described in [Adapters](adapters.md#mcp-weftaimcp). The
server name defaults to `weftai`.

`init` writes a starter domain into `dir` (default: the current directory): `package.json`,
`tsconfig.json`, and under `src/` one collection in `types.ts`, one operation plus
`standardOperations` in `operations.ts`, `domain.ts`, a fixture and a test.

## Testing helpers (`@weftai/testing`)

```ts
import { createTestRuntime, formatSnapshot, toHaveMatched } from "@weftai/testing";
import "@weftai/testing/matchers"; // optional Vitest matchers

const test = createTestRuntime(registry, ctx);
const result = await test.runSteps([{ id: "drone", op: "parts.find", input: { /* */ } }]);
toHaveMatched(result, "drone", 1);
expect(formatSnapshot(result)).toContain("drone (parts): 1 matched");
expect(result).toHaveMatched("drone", 1); // the same check as a matcher
```

`createTestRuntime(registry, ctx, runtimeOptions?)` returns `{ runtime, ctx, execute(plan),
runSteps(steps) }`; both calls take optional execute options such as `session`. Helpers:
`toHaveMatched(result, id, n)`, `toHaveNotice(result, id, pattern)`,
`toHaveFailed(result, id, pattern)` and `stepById(result, id)`; they throw with a message naming
the step. A pattern is a string (substring) or a `RegExp`. Importing `@weftai/testing/matchers`
registers `toHaveMatched(id, n)`, `toHaveNotice(id, pattern)` and `toHaveFailed(id, pattern)` on
Vitest's `expect`. `formatSnapshot(result)` returns the model-facing text; `loadFixture(path)`
reads JSON.
