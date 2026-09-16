# Adapters

Two adapters ship in v0.1: Anthropic (Claude tool runner) and MCP. Neither talks to a network
on its own; they wrap a `Runtime` you already configured with a domain.

## Anthropic (`@weftai/anthropic`)

```ts
import { weftaiTools, toToolDefinition } from "@weftai/anthropic";
import { createRuntime } from "weftai";

const runtime = createRuntime({ registry });
const tools = weftaiTools(runtime, {
  ctx,
  session: { id: conversationId },
  tools: [
    { name: "query_diagram", include: (op) => op.effects === "read" },
    { name: "select", include: (op) => op.name === "selection.select" },
  ],
});

// Pass `tools` to client.beta.messages.toolRunner({ model: "claude-opus-5", tools, … }).
```

Each spec becomes one Claude tool whose input is a **plan**. `include` decides which operations
the tool advertises **and** which it can run: a plan naming an operation outside the scope gets
`Unknown operation`, the same as if it were not registered. `strict: true` is on by default.
Set `eagerInputStreaming: true` to spread `eager_input_streaming: true`.

The session id defaults to one UUID per `weftaiTools()` call, so a later tool call in the
same runner can `$ref` an earlier result. Override per conversation.

`toToolDefinition(runtime, spec, { ctx, session })` returns
`{ name, description, input_schema, strict, handle }` for a manual tool-use loop. Do not set
`tool_choice` to force the tool — that is rejected on current models.

## MCP (`@weftai/mcp`)

```ts
import { createMcpServer } from "@weftai/mcp";

const mcp = createMcpServer(runtime, { name: "diagram", ctx });
await mcp.connectStdio();
```

Tools:

| Tool | Does |
|------|------|
| `run_plan` | Execute a plan; returns formatted text; stores results in the session. |
| `describe_operations` | Model-facing description of every operation. |
| `get_result` | Read a stored result by `$ref` (`$owned`, `$owned[2]`). |

The CLI wraps this: `weftai mcp --domain ./domain.ts`. Register with Claude Code using
`claude mcp add`.

## Live check

`examples/chat-anthropic` wires the diagram domain to Claude. It is excluded from CI and needs
`ANTHROPIC_API_KEY` (or `ant auth login`). Run `pnpm --filter chat-anthropic start`.
