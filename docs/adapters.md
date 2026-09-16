# Adapters

Weftai does not call models. Adapters take one bound tool (name, description, plan JSON Schema,
`handle(input) →` model-facing text) and emit it in a documented tool-calling wire format.

Families live in `@weftai/providers/<family>`. MCP is a protocol server, not a model host, and
stays in `@weftai/mcp`. The kernel (`bindTool`, schema dialects, capability catalog) is
`weftai/adapter`.

Never set `tool_choice` / `ANY` by default. Newest OpenAI, Anthropic and Gemini models reject a
forced tool.

## OpenAI (`@weftai/providers/openai`)

Chat Completions (nested `function`) and the Responses API (flat `type: "function"`). Azure uses
the same two families with `api-key` headers. Compat hosts are presets:

```ts
import { openaiTools, PRESETS } from "@weftai/providers/openai";

const tools = openaiTools(runtime, {
  api: "responses",
  model: "gpt-6-astra",
  ctx,
  session: { id: conversationId },
  tools: [{ name: "query_diagram", include: (op) => op.effects === "read" }],
});

openaiTools(runtime, { ...PRESETS.groq, model: "llama-3.3-70b-versatile", ctx, tools: [...] });
openaiTools(runtime, { ...PRESETS.qwenIntl, model: "qwen-plus", ctx, tools: [...] });
openaiTools(runtime, { ...PRESETS.ark, model: "ep-xxxxxxxx", ctx, tools: [...] });
```

GPT-6 Astra requires Responses. From GPT-5.4, Chat Completions rejects tools unless
`reasoning_effort` is `none`. Deprecated `functions` / `function_call` still maps for old Azure
and compat servers. Assistants and Realtime share the same `handle`.

## Anthropic (`@weftai/providers/anthropic`)

Messages API tools use `input_schema` and `tool_use` / `tool_result`. The beta `toolRunner` path
is `@weftai/providers/anthropic/tool-runner` (optional `@anthropic-ai/sdk` peer).

```ts
import { anthropicTools } from "@weftai/providers/anthropic";
import { weftaiTools } from "@weftai/providers/anthropic/tool-runner";

const messages = anthropicTools(runtime, {
  ctx,
  session: { id: conversationId },
  tools: [{ name: "query_diagram", include: (op) => op.effects === "read" }],
});
```

## Other families

| Import | Wire format |
|--------|-------------|
| `@weftai/providers/google` | Gemini `generateContent` functionDeclarations and Interactions |
| `@weftai/providers/bedrock` | Converse `toolConfig.toolSpec` (Nova uses a restricted schema) |
| `@weftai/providers/ollama` | Native `POST /api/chat` (object `arguments`, `tool_name`). `/v1` is the OpenAI preset |
| `@weftai/providers/cohere` | Chat v2 tools; results wrap Weftai text as citation documents |
| `@weftai/providers/dashscope` | Native Generation / MultiModal (`qwen3.8-*`). Compat-mode is `PRESETS.qwen` |
| `@weftai/providers/hunyuan` | Tencent Cloud TC3 `Tools` / `ToolChoice` |
| `@weftai/providers/spark` | Classic Spark HMAC `function_definition`. HTTP OpenAI-style is `PRESETS.sparkHttp` |
| `@weftai/providers/ai-sdk` | Vercel AI SDK `tool()` shape (`description`, `inputSchema`, `execute`) |

If a model cannot call tools, `lookupCapability` / the family helper errors with the fix (nearest
model, family, or `ollama.com/search?c=tool`). Unknown names are not assumed to be Chat
Completions; pass `api` to override the catalog for a new model.

Chinese descriptions stay UTF-8. Region is `cn` | `intl` with both `baseURL`s when the lab
publishes them.

## MCP (`@weftai/mcp`)

```ts
import { createMcpServer } from "@weftai/mcp";

const mcp = createMcpServer(runtime, { name: "diagram", ctx });
await mcp.connectStdio();
```

| Tool | Does |
|------|------|
| `run_plan` | Execute a plan; returns formatted text; stores results in the session. |
| `describe_operations` | Model-facing description of every operation. |
| `get_result` | Read a stored result by `$ref` (`$owned`, `$owned[2]`). |

The CLI wraps this: `weftai mcp --domain ./domain.ts`. Register with Claude Code using
`claude mcp add`.

## Live check

`examples/chat-*` binds the diagram domain in every family (`pnpm --filter chat-openai start`,
`chat-anthropic start:bind`, `chat-presets start`, …). `examples/chat-anthropic` `start` is the
live Claude tool-runner check (`ANTHROPIC_API_KEY`). Catalog rows: `docs/providers.md`.
