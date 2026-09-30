# @weftai/providers

Present a [weftai](https://www.npmjs.com/package/weftai) runtime as a tool on a model host.
weftai never calls a model itself: each adapter turns one bound plan tool into the tool
definition a host documents, and turns the host's tool calls back into plans. Your application
keeps its own SDK or HTTP client.

```sh
npm install weftai @weftai/providers
```

```ts
import { openaiTools, PRESETS } from "@weftai/providers/openai";

const tools = openaiTools(runtime, {
  ...PRESETS.qwenIntl,
  model: "qwen-plus",
  ctx,
  tools: [{ name: "query_tickets", include: (op) => op.effects === "read" }],
});
```

## Families

Each family is its own subpath, so an application loads only the ones it uses.

| Import | Host |
| --- | --- |
| `@weftai/providers/openai` | OpenAI Chat Completions and Responses, Azure OpenAI, and OpenAI-compatible hosts through `PRESETS` |
| `@weftai/providers/anthropic` | Anthropic Messages tools |
| `@weftai/providers/anthropic/tool-runner` | The Anthropic SDK's tool runner (needs the optional peer `@anthropic-ai/sdk`) |
| `@weftai/providers/google` | Gemini `generateContent` and Interactions |
| `@weftai/providers/bedrock` | Amazon Bedrock Converse |
| `@weftai/providers/ollama` | Ollama's native `/api/chat` |
| `@weftai/providers/cohere` | Cohere Chat v2 |
| `@weftai/providers/dashscope` | Alibaba DashScope Generation and MultiModalConversation |
| `@weftai/providers/hunyuan` | Tencent Cloud Hunyuan |
| `@weftai/providers/spark` | iFlytek Spark (WebSocket) |
| `@weftai/providers/ai-sdk` | The Vercel AI SDK's `tool()` shape |
| `@weftai/providers/laya` | A decision service over HTTP, for weftai's decisions interface (below) |

`PRESETS` holds the base URL and settings of hosted, local and regional OpenAI-compatible
hosts, so a preset plus a model name is a complete configuration.

## Decisions over HTTP

weftai's decisions interface asks a `Decider` short, typed questions (a choice, a score, a yes or
no) and gets back answers with probabilities. `LayaDecider` is one implementation, for a
decision service reached over HTTP. You supply its endpoint and key. Failures and timeouts
abstain rather than guess, and what a host does with an answer, including any permission, stays
the host's decision.

```ts
import { choice } from "weftai";
import { LayaDecider } from "@weftai/providers/laya";

const decider = new LayaDecider({ baseUrl: "http://127.0.0.1:8010" });
const answers = await decider.decide("Find some jazz", [
  choice("capability", "Which capability is relevant?", ["music", "research"]),
]);
```

## Documentation

- [Adapters](https://github.com/tochi-mba/weftai/blob/main/docs/adapters.md): binding one tool
  into every family, and MCP
- [Providers](https://github.com/tochi-mba/weftai/blob/main/docs/providers.md): families,
  presets and catalog rows
- [weftai](https://www.npmjs.com/package/weftai): the runtime these adapters present

## License

MIT
