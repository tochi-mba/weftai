# @weftai/cli

Run [weftai](https://www.npmjs.com/package/weftai) operations against saved plans, with no model
in the loop: execute a plan, validate one, describe what a model would see, read a trace, or
serve the operations over MCP.

```sh
npm install --save-dev @weftai/cli
npx weftai init my-domain
```

```text
weftai run <plan.json> --domain <file> [--fixture <file>] [--trace out.json] [--format text|json]
weftai validate <plan.json> --domain <file>
weftai describe --domain <file> [--json]
weftai trace <trace.json>
weftai mcp --domain <file> [--fixture <file>] [--name <name>]
weftai init [dir]
```

| Command | Does |
| --- | --- |
| `run` | Executes a plan and prints the model-facing text, or JSON with `--format json`, optionally writing a trace. Exits 1 when any step failed. |
| `validate` | Reports a plan's issues without running any handler |
| `describe` | Prints the operation list a model sees, or the plan's JSON schema with `--json` |
| `trace` | Prints each step's status, counts, timing and notices from a trace file |
| `mcp` | Serves the domain over MCP on standard input and output, ready for `claude mcp add` |
| `init` | Scaffolds a domain: one collection, one operation, the standard operations, a fixture and a test |

A domain file default-exports `{ registry, createContext(fixturePath?) }`. TypeScript domain
files load directly, without a build step.

See the [CLI guide](https://github.com/tochi-mba/weftai/blob/main/docs/cli.md).

## License

MIT
