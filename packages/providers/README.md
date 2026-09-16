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
