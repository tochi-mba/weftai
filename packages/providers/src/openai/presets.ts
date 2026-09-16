import type { FamilyId, Region } from "weftai/adapter";

export interface HostPreset {
  readonly provider: string;
  readonly api: FamilyId;
  readonly baseURL: string;
  readonly baseURLIntl?: string | undefined;
  readonly region?: Region | undefined;
  readonly extraBody?: Readonly<Record<string, unknown>> | undefined;
  readonly streamTools?: boolean | undefined;
  readonly modelIdKind?: "name" | "endpoint" | undefined;
}

export const PRESETS = {
  openai: {
    provider: "openai",
    api: "chat.completions",
    baseURL: "https://api.openai.com/v1",
  },
  openaiResponses: {
    provider: "openai",
    api: "responses",
    baseURL: "https://api.openai.com/v1",
  },
  azure: {
    provider: "azure-openai",
    api: "chat.completions",
    baseURL: "",
  },
  groq: { provider: "groq", api: "chat.completions", baseURL: "https://api.groq.com/openai/v1" },
  together: {
    provider: "together",
    api: "chat.completions",
    baseURL: "https://api.together.xyz/v1",
  },
  fireworks: {
    provider: "fireworks",
    api: "chat.completions",
    baseURL: "https://api.fireworks.ai/inference/v1",
  },
  openrouter: {
    provider: "openrouter",
    api: "chat.completions",
    baseURL: "https://openrouter.ai/api/v1",
  },
  xai: { provider: "xai", api: "chat.completions", baseURL: "https://api.x.ai/v1" },
  mistral: { provider: "mistral", api: "chat.completions", baseURL: "https://api.mistral.ai/v1" },
  cerebras: {
    provider: "cerebras",
    api: "chat.completions",
    baseURL: "https://api.cerebras.ai/v1",
  },
  nim: {
    provider: "nvidia-nim",
    api: "chat.completions",
    baseURL: "https://integrate.api.nvidia.com/v1",
  },
  vllm: { provider: "vllm", api: "chat.completions", baseURL: "http://127.0.0.1:8000/v1" },
  llamacpp: { provider: "llamacpp", api: "chat.completions", baseURL: "http://127.0.0.1:8080/v1" },
  lmstudio: { provider: "lmstudio", api: "chat.completions", baseURL: "http://127.0.0.1:1234/v1" },
  localai: { provider: "localai", api: "chat.completions", baseURL: "http://127.0.0.1:8080/v1" },
  litellm: { provider: "litellm", api: "chat.completions", baseURL: "http://127.0.0.1:4000/v1" },
  ollamaV1: { provider: "ollama", api: "chat.completions", baseURL: "http://127.0.0.1:11434/v1" },
  qwen: {
    provider: "dashscope",
    api: "chat.completions",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    baseURLIntl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    region: "cn",
    extraBody: { enable_thinking: false },
    streamTools: false,
  },
  qwenIntl: {
    provider: "dashscope",
    api: "chat.completions",
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    baseURLIntl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    region: "intl",
    extraBody: { enable_thinking: false },
    streamTools: false,
  },
  kimi: {
    provider: "moonshot",
    api: "chat.completions",
    baseURL: "https://api.moonshot.cn/v1",
    baseURLIntl: "https://api.moonshot.ai/v1",
    region: "cn",
  },
  kimiIntl: {
    provider: "moonshot",
    api: "chat.completions",
    baseURL: "https://api.moonshot.ai/v1",
    region: "intl",
  },
  glm: {
    provider: "zhipu",
    api: "chat.completions",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
  },
  qianfan: { provider: "qianfan", api: "chat.completions", baseURL: "" },
  ark: {
    provider: "ark",
    api: "chat.completions",
    baseURL: "https://ark.cn-beijing.volces.com/api/v3",
    baseURLIntl: "https://ark.ap-southeast.bytepluses.com/api/v3",
    region: "cn",
    modelIdKind: "endpoint",
  },
  minimax: {
    provider: "minimax",
    api: "chat.completions",
    baseURL: "https://api.minimax.cn/v1",
    baseURLIntl: "https://api.minimax.io/v1",
    region: "cn",
    extraBody: { thinking: { type: "disabled" } },
  },
  minimaxIntl: {
    provider: "minimax",
    api: "chat.completions",
    baseURL: "https://api.minimax.io/v1",
    region: "intl",
    extraBody: { thinking: { type: "disabled" } },
  },
  deepseek: {
    provider: "deepseek",
    api: "chat.completions",
    baseURL: "https://api.deepseek.com/v1",
  },
  stepfun: {
    provider: "stepfun",
    api: "chat.completions",
    baseURL: "https://api.stepfun.com/v1",
    baseURLIntl: "https://api.stepfun.ai/v1",
    region: "cn",
  },
  yi: { provider: "yi", api: "chat.completions", baseURL: "https://api.lingyiwanwu.com/v1" },
  hunyuanTokenHub: { provider: "hunyuan", api: "chat.completions", baseURL: "" },
  sparkHttp: { provider: "spark", api: "chat.completions", baseURL: "" },
  sensenova: { provider: "sensenova", api: "chat.completions", baseURL: "" },
  sambanova: {
    provider: "sambanova",
    api: "chat.completions",
    baseURL: "https://api.sambanova.ai/v1",
  },
  cloudflare: {
    provider: "cloudflare",
    api: "chat.completions",
    baseURL: "https://api.cloudflare.com/client/v4/accounts",
  },
  databricks: { provider: "databricks", api: "chat.completions", baseURL: "" },
  perplexity: {
    provider: "perplexity",
    api: "chat.completions",
    baseURL: "https://api.perplexity.ai",
  },
  deepinfra: {
    provider: "deepinfra",
    api: "chat.completions",
    baseURL: "https://api.deepinfra.com/v1/openai",
  },
  siliconflow: {
    provider: "siliconflow",
    api: "chat.completions",
    baseURL: "https://api.siliconflow.cn/v1",
    baseURLIntl: "https://api.siliconflow.com/v1",
    region: "cn",
  },
} as const satisfies Record<string, HostPreset>;
