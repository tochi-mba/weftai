/** Classic iFlytek Spark HMAC WebSocket `function_definition`. HTTP OpenAI-style is PRESETS.sparkHttp. */
import { sparkAuthUrl, sparkTools } from "@weftai/providers/spark";
import { diagram, isMain, queryTool, writeJson } from "../../chat-shared/src/shared.js";

export function bind() {
  const { runtime, ctx } = diagram();
  const mapped = sparkTools(runtime, { ctx, tools: [queryTool] });
  const url = sparkAuthUrl({
    host: "spark-api.xf-yun.com",
    path: "/v3.5/chat",
    apiKey: "key",
    apiSecret: "secret",
    date: "Thu, 01 Jan 2026 00:00:00 GMT",
  });
  return {
    name: mapped.function_definition[0]?.name,
    websocketHost: new URL(url).host,
  };
}

if (isMain(import.meta.url)) writeJson(bind());
