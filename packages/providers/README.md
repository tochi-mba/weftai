# @weftai/providers

Wire-format adapters for a Weftai runtime. Weftai does not call models; these packages map one
bound plan tool into the documented tool surface of each family.

```ts
import { openaiTools, PRESETS } from "@weftai/providers/openai";
import { anthropicTools } from "@weftai/providers/anthropic";
import { ollamaTools } from "@weftai/providers/ollama";
import { googleTools } from "@weftai/providers/google";

const tools = openaiTools(runtime, {
  ...PRESETS.qwenIntl,
  model: "qwen-plus",
  ctx,
  tools: [{ name: "query_supply_chain", include: (op) => op.effects === "read" }],
});
```

Subpath exports: `openai`, `anthropic`, `anthropic/tool-runner`, `google`, `bedrock`, `ollama`,
`cohere`, `dashscope`, `hunyuan`, `spark`, `ai-sdk`.

`@anthropic-ai/sdk` is an optional peer, required only for `anthropic/tool-runner`.

See `docs/adapters.md` and `docs/providers.md` in the Weftai repository.

## Laya decisions

The Laya adapter implements the shared Decider interface for a long-running HTTP service. Python: `from weftai.providers.laya import LayaDecider`; npm: `import { LayaDecider } from "@weftai/providers/laya"`. Supply an operator-owned endpoint, and an `httpx.AsyncClient` in Python. Failures abstain; permissions remain the host's responsibility.
