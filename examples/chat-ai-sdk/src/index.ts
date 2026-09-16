/** Vercel AI SDK `tool()` shape: description, JSON Schema, execute. */
import { aiSdkTools } from "@weftai/providers/ai-sdk";
import { diagram, isMain, queryTool, writeJson } from "../../chat-shared/src/shared.js";

export function bind() {
  const { runtime, ctx } = diagram();
  const tools = aiSdkTools(runtime, { ctx, tools: [queryTool] });
  const [tool] = tools;
  if (tool === undefined) throw new Error("expected a tool");
  return { descriptionStart: tool.description.slice(0, 24), schemaType: tool.inputSchema.type };
}

if (isMain(import.meta.url)) writeJson(bind());
