import type { Runtime } from "weftai";
import { type Capability, lookupCapability, type Region, type SchemaDialect } from "weftai/adapter";
import { bindProviderTools, type ProviderToolsOptions } from "../bind.js";
import { realtimeFunctionCallOutput, toAssistantsTools, toRealtimeTools } from "./assistants.js";
import { azureDeploymentURL, azureFoundryURL, azureHeaders } from "./azure.js";
import {
  type ChatCompletionsFunctionTool,
  handleChatCompletionsToolCalls,
  handleLegacyFunctionCall,
  toChatCompletionsTools,
  toLegacyFunctions,
} from "./chat.js";
import { type HostPreset, PRESETS } from "./presets.js";
import {
  handleResponsesFunctionCalls,
  type ResponsesFunctionTool,
  toResponsesTools,
} from "./responses.js";

export type { ChatCompletionsFunctionTool, HostPreset, ResponsesFunctionTool };
export {
  azureDeploymentURL,
  azureFoundryURL,
  azureHeaders,
  handleChatCompletionsToolCalls,
  handleLegacyFunctionCall,
  handleResponsesFunctionCalls,
  PRESETS,
  realtimeFunctionCallOutput,
  toAssistantsTools,
  toChatCompletionsTools,
  toLegacyFunctions,
  toRealtimeTools,
  toResponsesTools,
};

export interface OpenAIHostOptions {
  readonly api?: "chat.completions" | "responses" | undefined;
  readonly model?: string | undefined;
  readonly provider?: string | undefined;
  readonly region?: Region | undefined;
  readonly stream?: boolean | undefined;
  readonly extraBody?: Readonly<Record<string, unknown>> | undefined;
  readonly baseURL?: string | undefined;
  readonly dialect?: SchemaDialect | undefined;
  readonly strict?: boolean | undefined;
}

export interface OpenAIHost {
  readonly api: "chat.completions" | "responses";
  readonly dialect: SchemaDialect;
  readonly extraBody: Readonly<Record<string, unknown>> | undefined;
  readonly baseURL: string | undefined;
  readonly capability: Capability | undefined;
}

export function resolveOpenAIHost(options: OpenAIHostOptions): OpenAIHost {
  const api = options.api ?? "chat.completions";
  if (options.model === undefined) {
    return {
      api,
      dialect: options.dialect ?? (api === "responses" ? "openai-strict" : "union"),
      extraBody: options.extraBody,
      baseURL: options.baseURL,
      capability: undefined,
    };
  }
  const looked = lookupCapability(options.model, {
    api,
    provider: options.provider,
    region: options.region,
    stream: options.stream,
  });
  if (!looked.ok) throw new Error(looked.message);
  return {
    api,
    dialect: options.dialect ?? looked.capability.schemaDialect,
    extraBody: options.extraBody ?? looked.capability.extraBody,
    baseURL: options.baseURL ?? looked.baseURL,
    capability: looked.capability,
  };
}

export type OpenAIToolsOptions<Ctx> = ProviderToolsOptions<Ctx> & OpenAIHostOptions;

export function openaiTools<Ctx>(
  runtime: Runtime<Ctx>,
  options: OpenAIToolsOptions<Ctx> & { readonly api: "responses" },
): ResponsesFunctionTool[];
export function openaiTools<Ctx>(
  runtime: Runtime<Ctx>,
  options: OpenAIToolsOptions<Ctx>,
): ChatCompletionsFunctionTool[];
export function openaiTools<Ctx>(
  runtime: Runtime<Ctx>,
  options: OpenAIToolsOptions<Ctx>,
): ChatCompletionsFunctionTool[] | ResponsesFunctionTool[] {
  const host = resolveOpenAIHost(options);
  const bound = bindProviderTools(runtime, {
    ctx: options.ctx,
    tools: options.tools,
    session: options.session,
    dialect: host.dialect,
    strict: options.strict ?? host.api === "responses",
  });
  return host.api === "responses"
    ? toResponsesTools(bound, { strict: options.strict })
    : toChatCompletionsTools(bound, { strict: options.strict });
}
