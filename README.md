# Agentweft

Composable AI workflows. A model emits a declarative plan of named steps; your application
validates and executes it; results flow between steps by name and never travel through the model.

```json
{ "steps": [
  { "id": "acme",     "op": "nodes.find",        "input": { "filters": [{ "field": "label", "op": "fuzzy", "value": "Corporate 1" }] } },
  { "id": "owned",    "op": "nodes.descendants", "input": { "from": "$acme", "depth": "all" } },
  { "id": "delaware", "op": "nodes.filter",      "input": { "from": "$owned", "filters": [{ "field": "Jurisdiction", "op": "eq", "value": "Delaware" }] } }
] }
```

You define each operation once, with an input schema, an output type and a handler. Agentweft
derives validation, the model-facing tool schema and description, typed references between steps,
a session-scoped result store, token-budgeted formatting that never truncates silently, execution
traces and a local runner from that one definition.

## Status

Pre-release. Nothing is published to npm yet. See `docs/` for the design as it lands.

## Packages

| Package | Purpose |
|---------|---------|
| `agentweft` | Core runtime: operations, plans, validation, execution, result store, formatter, traces |
| `@agentweft/anthropic` | Expose a runtime to Claude through the Anthropic SDK tool runner |
| `@agentweft/mcp` | Expose a runtime as an MCP server |
| `@agentweft/testing` | Test runtime, matchers and fixture helpers |
| `@agentweft/cli` | `agentweft run | validate | describe | trace | mcp | init` |

## Development

```
pnpm install
pnpm build && pnpm lint && pnpm typecheck && pnpm test
```

Requires Node 22.12 or newer and pnpm (provided through corepack).
