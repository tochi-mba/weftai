/** Native DashScope Generation vs MultiModal. Compat-mode is examples/chat-qwen. */
import {
  dashscopeNativeKind,
  dashscopeNativeRequest,
  dashscopeTools,
} from "@weftai/providers/dashscope";
import { diagram, isMain, queryTool, writeJson } from "../../chat-shared/src/shared.js";

export function bind() {
  const { runtime, ctx } = diagram();
  const tools = dashscopeTools(runtime, { model: "qwen-plus", ctx, tools: [queryTool] });
  const request = dashscopeNativeRequest({
    model: "qwen-plus",
    messages: [{ role: "user", content: "Which subsidiaries are in Delaware?" }],
    tools,
    extraBody: { enable_thinking: false },
  });
  return {
    generation: dashscopeNativeKind("qwen-plus"),
    multimodal: dashscopeNativeKind("qwen3.8-max"),
    result_format: request.parameters.result_format,
    tool: tools[0]?.function.name,
  };
}

if (isMain(import.meta.url)) writeJson(bind());
