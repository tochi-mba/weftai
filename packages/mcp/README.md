# @agentweft/mcp

Expose an Agentweft runtime as an MCP server.

```ts
import { createMcpServer } from "@agentweft/mcp";

const mcp = createMcpServer(runtime, { name: "diagram", ctx });
await mcp.connectStdio();
```

| Tool | Does |
|------|------|
| `run_plan` | Execute a plan; returns the model-facing text; stores results in the session. |
| `describe_operations` | The model-facing description of every operation and the `$ref` syntax. |
| `get_result` | Read a stored result by `$ref` (`$owned`, `$owned[2]`). |

Options: `include` scopes operations, `allowWrites` gates `write` operations, `session` fixes the
session id, `ctx` may be a value or a factory. Use `mcp.server.connect(transport)` for any other
transport. The CLI wraps this as `agentweft mcp --domain ./domain.ts`.
