/** Native Ollama /api/chat. Object arguments and `tool_name` results. `/v1` is PRESETS.ollamaV1. */
import { ollamaTools } from "@weftai/providers/ollama";
import { diagram, isMain, queryTool, writeJson } from "../../chat-shared/src/shared.js";

export function bind() {
  const { runtime, ctx } = diagram();
  const tools = ollamaTools(runtime, { model: "llama3.2", ctx, tools: [queryTool] });
  const [tool] = tools;
  if (tool === undefined) throw new Error("expected a tool");
  return { type: tool.type, name: tool.function.name };
}

if (isMain(import.meta.url)) writeJson(bind());
