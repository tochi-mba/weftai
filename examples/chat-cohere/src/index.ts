/** Cohere Chat v2. Results wrap Weftai text as citation documents. */
import { cohereTools } from "@weftai/providers/cohere";
import { diagram, isMain, queryTool, writeJson } from "../../chat-shared/src/shared.js";

export function bind() {
  const { runtime, ctx } = diagram();
  const tools = cohereTools(runtime, { model: "command-a", ctx, tools: [queryTool] });
  const [tool] = tools;
  if (tool === undefined) throw new Error("expected a tool");
  return { type: tool.type, name: tool.function.name };
}

if (isMain(import.meta.url)) writeJson(bind());
