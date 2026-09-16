# CLI

`weftai` runs a domain against saved plans with no model in the loop.

A domain file default-exports `{ registry, createContext(fixturePath?) }`. TypeScript files load
through jiti; paths go through `pathToFileURL` so Windows drive letters work.

```
weftai run <plan.json> --domain <file> [--fixture <file>] [--trace out.json] [--format text|json]
weftai validate <plan.json> --domain <file>
weftai describe --domain <file> [--json]
weftai trace <trace.json>
weftai mcp --domain <file> [--fixture <file>] [--name <name>]
weftai init [dir]
```

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

`validate` reports plan issues (unknown op, bad `$ref`, malformed shape) without running
handlers. `describe` prints the model-facing operation list; `--json` prints the union plan
schema.

`init` writes one collection, one operation, `standardOperations`, a fixture and a test.

## Testing helpers (`@weftai/testing`)

```ts
import { createTestRuntime, formatSnapshot, toHaveMatched } from "@weftai/testing";
import "@weftai/testing/matchers"; // optional Vitest matchers

const test = createTestRuntime(registry, ctx);
const result = await test.runSteps([{ id: "drone", op: "parts.find", input: { /* */ } }]);
toHaveMatched(result, "drone", 1);
expect(formatSnapshot(result)).toContain("drone (parts): 1 matched");
```

Matchers: `toHaveMatched(id, n)`, `toHaveNotice(id, /pattern/)`, `toHaveFailed(id, /pattern/)`.
`loadFixture(path)` reads JSON.
