# Agentweft — working conventions

Agentweft is a TypeScript framework for composable AI workflows. A model emits a declarative
plan of named steps; the runtime validates and executes it; results flow between steps by
`$ref` name and never travel through the model. See `docs/` for the design and `README.md` for
the pitch.

## Repository

- pnpm workspace. `packages/*` are published (`agentweft`, `@agentweft/*`); `examples/*` are
  private. Run everything from the root: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- ESM only, built with `tsc`. No bundler. Node 20+.
- Zod 4 is the schema layer. Consumers import `z` from `agentweft` so one copy is loaded.
- Biome formats and lints. Vitest tests. Changesets versions.

## Rules that are part of the product

- Nothing truncates silently. Any cap or budget that shortens output emits a notice the formatter
  renders, with the exact count. Ordinals always index the full set.
- Errors name the fix. An unknown field lists the available fields; an unknown step suggests the
  nearest id; an invalid op suggests the nearest op.
- A wrong question is an error, never an empty result.
- Internal identifiers never appear in model-facing text.
- Results are session-scoped. Reusing a step id replaces the previous result and says so.

## Engineering rules

- Tests assert behaviour the model would see (formatted text, counts, notices), not only
  structure. A formatter test that never checks the rendered string is not a formatter test.
- Do not claim token or latency savings in docs or READMEs unless measured; say "structural
  counts" until then.
- Windows is a first-class dev platform: use `pathToFileURL` for dynamic imports, never string
  concatenate paths, and keep CI green on `windows-latest`.
- Keep third-party dependencies in `packages/core` at zero beyond Zod.
- No subagents or multi-agent workflows on this project; implement sequentially.
