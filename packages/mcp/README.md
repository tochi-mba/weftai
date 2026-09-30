# @weftai/mcp

Serve a [weftai](https://www.npmjs.com/package/weftai) runtime over the Model Context Protocol,
so any MCP client can plan against your operations.

```sh
npm install weftai @weftai/mcp
```

```ts
import { createMcpServer } from "@weftai/mcp";

const mcp = createMcpServer(runtime, { name: "tickets", ctx });
await mcp.connectStdio();
```

The server offers three tools:

| Tool | Does |
| --- | --- |
| `run_plan` | Executes a plan, returns the model-facing text, and keeps the results in the session |
| `describe_operations` | Describes every operation the model may use, and the `$ref` syntax |
| `get_result` | Reads a stored result by reference: `$open`, or `$open[2]` for one item |

## Options

| Option | Meaning |
| --- | --- |
| `name` | The server name a client sees |
| `ctx` | The context handlers receive: a value, or a function that returns one (sync or async) |
| `include` | Which operations to offer, as a predicate over each operation |
| `allowWrites` | `false` refuses operations with `write` effects; they may run otherwise |
| `session` | The session results are stored under, `{ id }`; `default` when omitted |

`connectStdio()` serves over standard input and output. For any other transport, pass it to
`mcp.server.connect(transport)`. The [CLI](https://www.npmjs.com/package/@weftai/cli) wraps this
as `weftai mcp --domain ./domain.ts`.

## License

MIT
