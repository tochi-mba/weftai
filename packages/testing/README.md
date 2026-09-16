# @weftai/testing

Test helpers for Weftai domains.

```ts
import { createTestRuntime, formatSnapshot, toHaveMatched } from "@weftai/testing";
import "@weftai/testing/matchers"; // optional Vitest matchers

const test = createTestRuntime(registry, ctx);
const result = await test.runSteps([{ id: "acme", op: "nodes.find" }]);

toHaveMatched(result, "acme", 1);
expect(result).toHaveNotice("acme", /loaded/);
expect(formatSnapshot(result)).toContain("acme (nodes): 1 matched");
```

Helpers: `createTestRuntime(registry, ctx, options?)`, `stepById`, `toHaveMatched`,
`toHaveNotice`, `toHaveFailed`, `formatSnapshot`, `loadFixture`. The matchers module adds
`toHaveMatched`, `toHaveNotice` and `toHaveFailed` to Vitest's `expect`.
