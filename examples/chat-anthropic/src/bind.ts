/** Anthropic Messages API: `input_schema`, `tool_use` / `tool_result`. Never sets tool_choice. */
import { anthropicTools } from "@weftai/providers/anthropic";
import { diagram, isMain, queryTool, writeJson } from "../../chat-shared/src/shared.js";

export function bind() {
  const { runtime, ctx } = diagram();
  const tools = anthropicTools(runtime, { ctx, tools: [queryTool] });
  const [tool] = tools;
  if (tool === undefined) throw new Error("expected a tool");
  return {
    name: tool.name,
    input_schema: { type: tool.input_schema.type, required: tool.input_schema.required },
  };
}

if (isMain(import.meta.url)) writeJson(bind());
