/**
 * OpenAI Responses (flat function tools) and Chat Completions (nested function).
 */
import { openaiTools } from "@weftai/providers/openai";
import { isMain, queryTool, supplyChain, writeJson } from "../../chat-shared/src/shared.js";

export function bind() {
  const { runtime, ctx } = supplyChain();
  const responses = openaiTools(runtime, {
    api: "responses",
    model: "gpt-4o",
    ctx,
    tools: [queryTool],
  });
  const chat = openaiTools(runtime, {
    api: "chat.completions",
    model: "gpt-4o",
    ctx,
    tools: [queryTool],
  });
  const [responseTool] = responses;
  const [chatTool] = chat;
  if (responseTool === undefined || chatTool === undefined) throw new Error("expected tools");
  return {
    responses: { type: responseTool.type, name: responseTool.name, strict: responseTool.strict },
    chat: { type: chatTool.type, name: chatTool.function.name },
  };
}

if (isMain(import.meta.url)) writeJson(bind());
