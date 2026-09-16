/** Native Tencent Hunyuan TC3 ChatCompletions. ToolChoice stays auto. */
import { hunyuanAuthorization, hunyuanTools } from "@weftai/providers/hunyuan";
import { diagram, isMain, queryTool, writeJson } from "../../chat-shared/src/shared.js";

export function bind() {
  const { runtime, ctx } = diagram();
  const mapped = hunyuanTools(runtime, { model: "hunyuan-turbos", ctx, tools: [queryTool] });
  const auth = hunyuanAuthorization({
    secretId: "AKIDexample",
    secretKey: "secret",
    payload: "{}",
    timestamp: 1_700_000_000,
  });
  return {
    ToolChoice: mapped.ToolChoice,
    name: mapped.Tools[0]?.Function.Name,
    authorizationPrefix: auth.authorization.slice(0, 16),
  };
}

if (isMain(import.meta.url)) writeJson(bind());
