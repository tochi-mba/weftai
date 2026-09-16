# @agentweft/cli

Run an Agentweft domain against saved plans with no model in the loop.

```
agentweft run <plan.json> --domain <file> [--fixture <file>] [--trace out.json] [--format text|json]
agentweft validate <plan.json> --domain <file>
agentweft describe --domain <file> [--json]
agentweft trace <trace.json>
agentweft mcp --domain <file> [--fixture <file>] [--name <name>]
agentweft init [dir]
```

A domain file default-exports `{ registry, createContext(fixturePath?) }`. TypeScript domain
files load through jiti.

- `run` executes a plan and prints the model-facing text (or `--format json`), optionally writing
  a trace. Exit code 1 when any step failed.
- `validate` reports plan issues without running handlers.
- `describe` prints the model-facing operation list, or the union plan schema with `--json`.
- `trace` prints a table of steps, status, counts, timings and notices from a trace file.
- `mcp` serves the domain over MCP stdio, ready for `claude mcp add`.
- `init` scaffolds a domain package with one collection, one operation, the standard operations,
  a fixture and a test.
