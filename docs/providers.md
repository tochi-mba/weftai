# Provider catalog

The adapters in `@weftai/providers` turn one runtime tool into a host's tool-calling wire format:
tool definitions, parsing the tool calls that come back, and the result payloads. They make no
network requests, run no provider-managed tool, and never choose a model. (`LayaDecider` in
`@weftai/providers/laya` is the exception: it is not a tool adapter but a
[decider](decisions.md#laya-decider), and it sends HTTP requests.)

Which model can call tools on which API is a checked-in capability catalog (`CAPABILITIES` in
`weftai/adapter`, tested as data). Lookups use **model + api**. A row that cannot call tools is
an error naming the fix, never an empty tool list. `openaiTools` defaults `api` to
`"chat.completions"`, so pass `api: "responses"` for models catalogued only on Responses
(GPT-5 and GPT-6).

Region is `cn` or `intl`. Thinking flags live in `extraBody`. `modelIdKind: endpoint` means the
`model` field is an Ark `ep-…` id.

## Western and cloud

| Provider | `api` in the catalog | Notes |
|----------|--------------------|-------|
| OpenAI | `chat.completions` (`gpt-4o`, `gpt-4.1`); `responses` (`gpt-4o`, `gpt-5`, `gpt-6`) | GPT-6 Astra requires Responses. GPT-5.4 Chat Completions rejects tools unless `reasoning_effort` is none |
| Azure OpenAI / Foundry | same two families | `api-key` header; set the deployment `baseURL` |
| Anthropic | `anthropic.messages` / `anthropic.toolRunner` | `input_schema`. Do not force `tool_choice` |
| Google | `gemini.generateContent` / `gemini.interactions` | Vertex uses uppercase schema types |
| Bedrock | `bedrock.converse` | Nova: `type` / `properties` / `required` only. Claude/Llama/Mistral/Command share Converse |
| Cohere | `cohere.chat` | Chat v2; citation documents on results |
| Groq, Together, Fireworks, OpenRouter, xAI, Mistral, Cerebras, NIM, SambaNova, DeepInfra | `chat.completions` | OpenAI-compat presets. OpenRouter and xAI (`grok-*`) also have `responses` rows |
| Cloudflare, Databricks | `chat.completions` | Set the account/workspace `baseURL` |
| Perplexity Sonar | `chat.completions` | **No** custom Weftai tools (search-grounded) |

## Chinese (first-class)

| Provider | Preset | CN URL | Intl URL | Tools notes |
|----------|--------|--------|----------|-------------|
| Qwen / DashScope | `PRESETS.qwen` / `qwenIntl` | `dashscope.aliyuncs.com/compatible-mode/v1` | `dashscope-intl.aliyuncs.com/compatible-mode/v1` | Region-specific keys. Some models reject `tools` + `stream: true`. Native Generation vs MultiModal (`qwen3.8-*`) is `@weftai/providers/dashscope` |
| Kimi / Moonshot | `kimi` / `kimiIntl` | `api.moonshot.cn/v1` | `api.moonshot.ai/v1` | Tools documented. K3 uses `reasoning_effort` |
| GLM / Zhipu | `glm` | `open.bigmodel.cn/api/paas/v4` | — | Streamed `arguments` arrive in chunks |
| Qianfan / ERNIE | `qianfan` | set from console | — | ERNIE tools yes. Qianfan lists tools for `kimi-k2` / `qwen3` / `deepseek-v3.1` as not yet available, so the catalog rejects them |
| Doubao / Ark | `ark` | `ark.cn-beijing.volces.com/api/v3` | `ark.ap-southeast.bytepluses.com/api/v3` | Model is `ep-…`, not a public slug |
| MiniMax | `minimax` / `minimaxIntl` | `api.minimax.cn/v1` | `api.minimax.io/v1` | Write back the full assistant tool-call message. `thinking.type` disabled/adaptive |
| DeepSeek | `deepseek` | `api.deepseek.com/v1` | — | `deepseek-chat` tools; `deepseek-reasoner` is not a tool model |
| StepFun | `stepfun` | `api.stepfun.com/v1` | `api.stepfun.ai/v1` | Tools on `step-3.7-flash` / `step-3.5-flash`. Max 128 tools |
| 01.AI Yi | `yi` | `api.lingyiwanwu.com/v1` | — | Tools **unknown** until the live card confirms them |
| SenseNova | `sensenova` | set from console | — | OpenAI-compat chat |
| Hunyuan | `hunyuanTokenHub` or `@weftai/providers/hunyuan` | TokenHub or TC3 | — | Native Tools only on `hunyuan-turbos`, `hunyuan-t1`, `hunyuan-functioncall` |
| Spark | `sparkHttp` or `@weftai/providers/spark` | set from console | — | HTTP OpenAI-style, or classic WebSocket HMAC |
| SiliconFlow | `siliconflow` | `api.siliconflow.cn/v1` | `api.siliconflow.com/v1` | Gateway; tools follow the routed model |

## Local

| Provider | API | Notes |
|----------|-----|-------|
| Ollama | `ollama.chat` or `/v1` Chat Completions (`PRESETS.ollamaV1`) | Tools on the listed tags (`llama3.2`, `qwen3`, `mistral`, `firefunction`). Others error with `ollama.com/search?c=tool`. `tinyllama` is JSON-mode-only |
| vLLM, llama.cpp, LM Studio, LocalAI, LiteLLM | `chat.completions` | OpenAI-compat local servers |

Override the catalog with `api` when a new model ships before the table updates. Do not assume
Chat Completions for an unknown name.

## Presets

`PRESETS` in `@weftai/providers/openai` holds the OpenAI-shaped host configurations (`provider`,
`api`, `baseURL`, and where they apply `baseURLIntl`, `region`, `extraBody`, `streamTools` and
`modelIdKind`). Spread one into `openaiTools` and add `model`, `ctx` and `tools`. The keys are:
`openai`, `openaiResponses`, `azure`, `groq`, `together`, `fireworks`, `openrouter`, `xai`,
`mistral`, `cerebras`, `nim`, `vllm`, `llamacpp`, `lmstudio`, `localai`, `litellm`, `ollamaV1`,
`qwen`, `qwenIntl`, `kimi`, `kimiIntl`, `glm`, `qianfan`, `ark`, `minimax`, `minimaxIntl`,
`deepseek`, `stepfun`, `yi`, `hunyuanTokenHub`, `sparkHttp`, `sensenova`, `sambanova`,
`cloudflare`, `databricks`, `perplexity`, `deepinfra` and `siliconflow`. A preset whose
`baseURL` is empty (`azure`, `qianfan`, `hunyuanTokenHub`, `sparkHttp`, `sensenova`,
`databricks`) needs your endpoint. A preset describes a host surface, not a guarantee that every
model on that host supports tools.
