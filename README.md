# Weftai

A Rex Technologies product.

Composable AI workflows. A model emits a declarative plan of named steps; your application
validates and executes it; results flow between steps by name and never travel through the model.

```json
{ "steps": [
  { "id": "acme",     "op": "nodes.find",        "input": { "filters": [{ "field": "label", "op": "fuzzy", "value": "Corporate 1" }] } },
  { "id": "owned",    "op": "nodes.descendants", "input": { "from": "$acme", "depth": "all" } },
  { "id": "delaware", "op": "nodes.filter",      "input": { "from": "$owned", "filters": [{ "field": "Jurisdiction", "op": "eq", "value": "Delaware" }] } }
] }
```

One tool call, three dependent lookups, zero identifiers copied by the model. The model reads:

```
acme (nodes): 1 matched
  1. Corporate 1
  [intermediate step - preview only; reference $acme to use the full set]
owned (nodes): 3 matched
  1. Sub 1 Ltd
  2. Sub 2 Ltd
  3. Sub 3 Ltd
  [intermediate step - preview only; reference $owned to use the full set]
delaware (nodes): 2 matched
  1. Sub 2 Ltd
  2. Sub 3 Ltd
```

A later tool call can still say `{ "refs": ["$owned"] }` or `$matches[2]`: results stay in a
session-scoped store, and positions always index the full set, not the preview.

## What you define, and what you get

You define each operation once: a name, a description for the model, a Zod input schema, an
output type and a handler.

```ts
import { collection, defineOperationFor, ref, standardOperations, z } from "weftai";

const Nodes = collection("nodes", Node, {
  label: (n) => n.label,
  key: (n) => n.id,
  fields: () => [
    { name: "label", aliases: ["name"], get: (n) => n.label },
    { name: "Jurisdiction", get: (n) => n.properties.Jurisdiction },
  ],
});

const define = defineOperationFor<DiagramContext>();

export const descendants = define({
  name: "nodes.descendants",
  description: "Everything the given entities own, walking ownership edges down.",
  input: z.object({ from: ref(Nodes), depth: z.union([z.int().min(1), z.literal("all")]).default("all") }),
  output: Nodes,
  run: ({ input, ctx }) => walkDown(ctx.diagram, input.from.items, input.depth),
});

const registry = createRegistry({ operations: [findNodes, descendants, ...standardOperations(Nodes)] });
const runtime = createRuntime({ registry });
const result = await runtime.execute(plan, { ctx, session: { id: conversationId } });
result.text; // the model-facing string above
```

From that one definition Weftai derives:

- **Validation** with actionable errors: unknown operations suggest the nearest name, unknown
  fields list the available ones, a reference to the wrong kind of result says which kind it
  expected. A wrong question is an error, never an empty result.
- **Typed references** between steps. `ref(Nodes)` renders as a `$stepId` string for the model and
  arrives in the handler as a `Collection<Node>`.
- **Execution** in dependency order: independent steps run together, a failed step skips only its
  dependents, timeouts and cancellation are built in, and every step is traced.
- **Session-scoped results** so the next tool call can build on this one.
- **Token-budgeted formatting** that never truncates silently: exact counts, `showing 30 of 35`,
  and notices for every cap that bit.
- **Standard operations** per collection: `filter`, `count`, `countBy`, `distinct`, `mostCommon`,
  `first`, `pick`, `details`.
- **A model-facing tool** for Claude or any MCP client, and a **CLI** that runs saved plans against
  fixtures with no model in the loop.

## Packages

| Package | Purpose |
|---------|---------|
| `weftai` | Core runtime: operations, plans, validation, execution, result store, formatter, traces |
| `@weftai/providers` | Wire-format adapters (OpenAI, Anthropic, Gemini, Bedrock, Ollama, Chinese hosts, …) |
| `@weftai/mcp` | Expose a runtime as an MCP server |
| `@weftai/testing` | Test runtime, Vitest matchers and fixture helpers |
| `@weftai/cli` | `weftai run | validate | describe | trace | mcp | init` |

## Examples

- `examples/diagram` ports the corporate-structure domain the framework grew out of. Its
  thirteen scenarios assert the exact text the model sees and are the acceptance suite.
- `examples/documents` is a second, unrelated domain (contracts) that proves the core is not
  graph-shaped.
- `examples/chat-*` binds the diagram domain in each family: `chat-openai` (Chat Completions +
  Responses), `chat-azure`, `chat-anthropic` (Messages bind plus a live Claude tool-runner),
  `chat-gemini`, `chat-bedrock`, `chat-ollama`, `chat-cohere`, `chat-dashscope`, `chat-hunyuan`,
  `chat-spark`, `chat-ai-sdk`, `chat-qwen`, and `chat-presets` (Groq, Kimi, GLM, Ark, MiniMax,
  DeepSeek, …). `pnpm --filter chat-presets start` prints the full preset list. Live Claude:
  `ANTHROPIC_API_KEY` and `pnpm --filter chat-anthropic start`.

## Docs

`docs/concepts.md`, `docs/plan-format.md`, `docs/writing-operations.md`, `docs/formatting.md`,
`docs/adapters.md`, `docs/providers.md`, `docs/cli.md`, and `docs/design-notes.md` for decisions
and ideas.

Claims in these docs are structural counts (steps and tool calls per question). Token and
latency savings are not claimed until measured.

## Development

```
pnpm install
pnpm build && pnpm lint && pnpm typecheck && pnpm test
```

Requires Node 22.12 or newer and pnpm (provided through corepack). CI runs the same gates on
Windows and Ubuntu. No source file may exceed 1,000 lines; a test enforces it.

## Releasing

Every change that should ship gets a changeset (`pnpm changeset`). On push to `main`, the
Release workflow opens a "Version packages" pull request that bumps versions and changelogs;
merging it publishes the changed packages to npm and tags the release. The workflow needs the
`NPM_TOKEN` repository secret (an npm granular token with write access and two-factor bypass).

Tests must keep 100% statement, branch, function and line coverage; `pnpm test:coverage`
enforces it locally and in CI.

## Status

Version 0.1.0 is published on npm as `weftai` and `@weftai/*`. Source and the `v0.1.0` tag live
at https://github.com/tochi-mba/weftai.
