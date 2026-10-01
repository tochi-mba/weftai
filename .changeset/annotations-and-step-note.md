---
"weftai": minor
"@weftai/mcp": minor
---

Operations carry `annotations` (`readOnly`, `destructive`, `idempotent`, `openWorld`), named and
defaulted as MCP's tool annotations are: a write is destructive and not idempotent, and anything
may reach outside the process, unless it says otherwise. Declaring `readOnly` against `effects`,
or `destructive` on a read, is a definition error. `describe` gives every write an `effect:` line
saying whether it is destructive or safe to repeat, so the model knows before it plans. Standard
operations are `openWorld: false`.

A plan step may carry a `note`: one plain sentence, at most 200 characters (`NOTE_MAX_CHARS`),
saying what the step is for. It is never executed or shown back to the model; it is on the
validated step, the step result, the trace and every hook, for a host's approval prompt,
progress line or log.

`@weftai/mcp` annotates its three tools. `describe_operations` and `get_result` are local reads;
`run_plan`'s hints are read off the operations it can run (`planAnnotations`), so a client no
longer has to assume every tool is destructive and open-world.
