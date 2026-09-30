# @weftai/testing

Test helpers for [weftai](https://www.npmjs.com/package/weftai) operations and plans: a test
runtime, assertions, fixture loading and optional Vitest matchers. The example uses the
`tickets` registry from weftai's [quick start](https://www.npmjs.com/package/weftai#quick-start).

```sh
npm install --save-dev @weftai/testing
```

```ts
import { createTestRuntime, formatSnapshot, toHaveMatched } from "@weftai/testing";
import "@weftai/testing/matchers"; // optional: adds the matchers to Vitest's expect

const test = createTestRuntime(registry, { tickets });
const result = await test.runSteps([{ id: "all", op: "tickets.find" }]);

toHaveMatched(result, "all", 3);
expect(formatSnapshot(result)).toContain("all (tickets): 3 matched");
expect(result).toHaveMatched("all", 3); // the same check, as a matcher
```

| Helper | Does |
| --- | --- |
| `createTestRuntime(registry, ctx, options?)` | A runtime bound to your registry and context, with `execute(plan)` and `runSteps(steps)` |
| `stepById(result, id)` | One step of a result; throws naming the steps there are when `id` is not one |
| `toHaveMatched(result, id, count)` | Asserts a step matched exactly `count` items |
| `toHaveNotice(result, id, pattern)` | Asserts a step carries a matching notice |
| `toHaveFailed(result, id, pattern?)` | Asserts a step failed, optionally with a matching error |
| `formatSnapshot(result)` | The model-facing text, stable enough to snapshot |
| `loadFixture(path)` | Reads and parses a JSON fixture |

`@weftai/testing/matchers` adds `toHaveMatched`, `toHaveNotice` and `toHaveFailed` to Vitest's
`expect`; Vitest 4 or newer is an optional peer, needed only for that import.

## License

MIT
