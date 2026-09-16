/**
 * Every OpenAI-compat preset (Western, local, and Chinese) bound to the same Weftai tool.
 * Hosts that are not OpenAI-shaped have their own `examples/chat-*` packages.
 */
import { type HostPreset, openaiTools, PRESETS } from "@weftai/providers/openai";
import { isMain, queryTool, supplyChain, writeJson } from "../../chat-shared/src/shared.js";

export function bind() {
  const { runtime, ctx } = supplyChain();
  return Object.entries(PRESETS).map(([name, preset]) => {
    const host = preset as HostPreset;
    const tools =
      host.api === "responses"
        ? openaiTools(runtime, {
            api: "responses",
            provider: host.provider,
            baseURL: host.baseURL,
            extraBody: host.extraBody,
            region: host.region,
            ctx,
            tools: [queryTool],
          })
        : openaiTools(runtime, {
            api: "chat.completions",
            provider: host.provider,
            baseURL: host.baseURL,
            extraBody: host.extraBody,
            region: host.region,
            ctx,
            tools: [queryTool],
          });
    const [tool] = tools;
    const toolName =
      tool === undefined ? undefined : "function" in tool ? tool.function.name : tool.name;
    return {
      preset: name,
      provider: host.provider,
      api: host.api,
      baseURL: host.baseURL,
      baseURLIntl: host.baseURLIntl,
      region: host.region,
      tool: toolName,
    };
  });
}

if (isMain(import.meta.url)) writeJson(bind());
