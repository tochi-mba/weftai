# CLI

`agentweft` runs a domain against saved plans with no model in the loop.

A domain file default-exports `{ registry, createContext(fixturePath?) }`. TypeScript files load
through jiti; paths go through `pathToFileURL` so Windows drive letters work.

```
agentweft run <plan.json> --domain <file> [--fixture <file>] [--trace out.json] [--format text|json]
agentweft validate <plan.json> --domain <file>
agentweft describe --domain <file> [--json]
agentweft trace <trace.json>
agentweft mcp --domain <file> [--fixture <file>] [--name <name>]
agentweft init [dir]
```

## Examples

Delaware subsidiaries, from the repo root:

```
agentweft run examples/diagram/plans/05-delaware.json --domain examples/diagram/src/domain.ts --trace out.json
agentweft trace out.json
```

Expect three steps with counts 1 / 3 / 2: Corporate 1, its three subsidiaries, and the two
incorporated in Delaware. The fixture is the proposal's test diagram, so every scenario in the
proposal can be replayed with `run` against `examples/diagram/src/domain.ts`.

`validate` reports plan issues (unknown op, bad `$ref`, malformed shape) without running
handlers. `describe` prints the model-facing operation list; `--json` prints the union plan
schema.

`init` writes one collection, one operation, `standardOperations`, a fixture and a test.

## Testing helpers (`@agentweft/testing`)

```ts
import { createTestRuntime, formatSnapshot, toHaveMatched } from "@agentweft/testing";
import "@agentweft/testing/matchers"; // optional Vitest matchers

const test = createTestRuntime(registry, ctx);
const result = await test.runSteps([{ id: "acme", op: "nodes.find", input: { /* */ } }]);
toHaveMatched(result, "acme", 1);
expect(formatSnapshot(result)).toContain("acme (nodes): 1 matched");
```

Matchers: `toHaveMatched(id, n)`, `toHaveNotice(id, /pattern/)`, `toHaveFailed(id, /pattern/)`.
`loadFixture(path)` reads JSON.
