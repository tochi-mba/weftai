/** Qwen international compatible-mode. Region-specific DashScope keys. */
import { openaiTools, PRESETS } from "@weftai/providers/openai";
import { diagram, isMain, queryTool, writeJson } from "../../chat-shared/src/shared.js";

export function bind() {
  const { runtime, ctx } = diagram();
  const tools = openaiTools(runtime, {
    ...PRESETS.qwenIntl,
    model: "qwen-plus",
    ctx,
    extraBody: { enable_thinking: false },
    tools: [queryTool],
  });
  const [tool] = tools;
  if (tool === undefined) throw new Error("expected a tool");
  return { preset: PRESETS.qwenIntl.baseURL, name: tool.function.name };
}

if (isMain(import.meta.url)) writeJson(bind());
