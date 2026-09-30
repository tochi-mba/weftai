# weftai

Composable AI workflows. A model emits a declarative plan of named steps; your application
validates and executes it; results flow between steps by `$name` and never travel through the
model.

One tool call answers a question that would otherwise take several, and the model never copies
an identifier from one result into the next request.

```sh
npm install weftai
```

Node 22.12 or newer. ESM only. The same library is on PyPI for Python 3.12+ as
[`weftai`](https://pypi.org/project/weftai/), with the same plan format.

## Quick start

Define a collection and the operations that return it, then execute a plan:

```ts
import { collection, createRegistry, createRuntime, defineOperation, standardOperations, z } from "weftai";

const Ticket = z.object({ id: z.string(), title: z.string(), status: z.string() });
const Tickets = collection("tickets", Ticket, {
  label: (ticket) => ticket.title,
  key: (ticket) => ticket.id,
  fields: () => [{ name: "status", get: (ticket) => ticket.status }],
});

const find = defineOperation({
  name: "tickets.find",
  description: "Every ticket. Start here.",
  input: z.object({}),
  output: Tickets,
  run: ({ ctx }) => ctx.tickets,
});

const runtime = createRuntime({
  registry: createRegistry({ operations: [find, ...standardOperations(Tickets)] }),
});

const tickets = [
  { id: "t1", title: "Login page times out", status: "open" },
  { id: "t2", title: "Export drops the last row", status: "open" },
  { id: "t3", title: "Typo on the pricing page", status: "closed" },
];

const result = await runtime.execute(
  {
    steps: [
      { id: "all", op: "tickets.find" },
      { id: "open", op: "tickets.filter", input: { from: "$all", filters: [{ field: "status", value: "open" }] } },
    ],
  },
  { ctx: { tickets }, session: { id: "conversation-1" } },
);

console.log(result.text);
```

`result.text` is what the model reads:

```text
all (tickets): 3 matched
  1. Login page times out
  2. Export drops the last row
  3. Typo on the pricing page
  [intermediate step - preview only; reference $all to use the full set]
open (tickets): 2 matched
  1. Login page times out
  2. Export drops the last row
```

`result.steps` has each step's status, data, notices and timing, and `result.trace` is JSON for
the CLI or an inspector. A later plan in the same session can use `$open` or `$open[2]`: results
are kept in a session-scoped store, and positions always index the full set.

## What you get from one definition

- **Validation with actionable errors.** An unknown operation suggests the nearest name, an
  unknown field lists the available ones, and a reference to the wrong kind of result says which
  kind was expected. A wrong question is an error, never an empty result.
- **Typed references.** `ref(Tickets)` renders as a `$stepId` string for the model and arrives in
  the handler as a collection. A whole reference written into a field that does not take one is
  refused before anything runs.
- **Execution in dependency order.** Independent steps run together, a failed step skips only
  its dependents, and timeouts and cancellation are built in.
- **Token-budgeted formatting** that never truncates silently: exact counts, `showing 30 of 35`,
  and a notice for every cap that applied.
- **Standard operations** for every collection: `filter`, `count`, `countBy`, `distinct`,
  `mostCommon`, `first`, `pick` and `details`.

## Packages

| Package | Purpose |
| --- | --- |
| [`weftai`](https://www.npmjs.com/package/weftai) | Operations, plans, validation, execution, the result store, formatting and traces |
| [`@weftai/providers`](https://www.npmjs.com/package/@weftai/providers) | Present a runtime as a tool on OpenAI, Anthropic, Gemini, Bedrock, Ollama, Cohere and more |
| [`@weftai/mcp`](https://www.npmjs.com/package/@weftai/mcp) | Serve a runtime over the Model Context Protocol |
| [`@weftai/testing`](https://www.npmjs.com/package/@weftai/testing) | A test runtime, assertions and Vitest matchers |
| [`@weftai/cli`](https://www.npmjs.com/package/@weftai/cli) | `weftai run`, `validate`, `describe`, `trace`, `mcp` and `init` |

All five are released together and share a version.

## Documentation

- [Concepts](https://github.com/tochi-mba/weftai/blob/main/docs/concepts.md): plans,
  references, sessions and what the model is shown
- [Plan format](https://github.com/tochi-mba/weftai/blob/main/docs/plan-format.md): the wire
  format, validation issues and execution order
- [Writing operations](https://github.com/tochi-mba/weftai/blob/main/docs/writing-operations.md):
  operations, collections and the standard set
- [Formatting](https://github.com/tochi-mba/weftai/blob/main/docs/formatting.md): budgets,
  presentation and notices
- [Adapters](https://github.com/tochi-mba/weftai/blob/main/docs/adapters.md) and
  [providers](https://github.com/tochi-mba/weftai/blob/main/docs/providers.md): binding a
  runtime to a model host
- [CLI](https://github.com/tochi-mba/weftai/blob/main/docs/cli.md)
- [Changelog](https://github.com/tochi-mba/weftai/blob/main/packages/core/CHANGELOG.md)

## License

MIT
