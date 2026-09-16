# weftai

Core runtime for composable AI workflows: a model emits a declarative plan of named steps, your
application validates and executes it, and results flow between steps by `$name` without ever
travelling through the model.

```ts
import { collection, createRegistry, createRuntime, defineOperation, ref, standardOperations, z } from "weftai";

const Item = z.object({ id: z.string(), label: z.string(), kind: z.string() });
const Items = collection("items", Item, {
  label: (item) => item.label,
  key: (item) => item.id,
  fields: () => [{ name: "kind", get: (item) => item.kind }],
});

const find = defineOperation({
  name: "items.find",
  description: "Every item. Start here.",
  input: z.object({}),
  output: Items,
  run: ({ ctx }) => ctx.items,
});

const runtime = createRuntime({
  registry: createRegistry({ operations: [find, ...standardOperations(Items)] }),
});

const result = await runtime.execute(
  {
    steps: [
      { id: "all", op: "items.find" },
      { id: "demo", op: "items.filter", input: { from: "$all", filters: [{ field: "kind", value: "demo" }] } },
    ],
  },
  { ctx: { items }, session: { id: "conversation-1" } },
);

result.text;   // what the model reads: exact counts, labels, notices
result.steps;  // per-step status, data, notices, timing
result.trace;  // JSON for the CLI or an inspector
```

What the definition gives you: validation with actionable errors, typed `$ref` fields that resolve
to collections, dependency-ordered execution with timeouts and cancellation, a session-scoped
result store, and token-budgeted formatting that never truncates silently.

Adapters: `@weftai/providers` (OpenAI, Anthropic, Gemini, Bedrock, Ollama, Chinese hosts),
`@weftai/mcp` (MCP server), `@weftai/testing` (test helpers), `@weftai/cli` (`weftai run |
validate | describe | trace | mcp | init`).

Full documentation lives in the repository's `docs/` folder.
