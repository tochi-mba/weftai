/** Azure OpenAI / Foundry: same Chat Completions family, `api-key` header. */
import { azureFoundryURL, azureHeaders, openaiTools, PRESETS } from "@weftai/providers/openai";
import { diagram, isMain, queryTool, writeJson } from "../../chat-shared/src/shared.js";

export function bind() {
  const { runtime, ctx } = diagram();
  const tools = openaiTools(runtime, { ...PRESETS.azure, ctx, tools: [queryTool] });
  const [tool] = tools;
  if (tool === undefined) throw new Error("expected a tool");
  return {
    baseURL: azureFoundryURL("my-resource"),
    headers: azureHeaders("AZURE_KEY"),
    name: tool.function.name,
  };
}

if (isMain(import.meta.url)) writeJson(bind());
