/** Bedrock Converse. Nova uses the restricted schema dialect. */
import { bedrockTools } from "@weftai/providers/bedrock";
import { diagram, isMain, queryTool, writeJson } from "../../chat-shared/src/shared.js";

export function bind() {
  const { runtime, ctx } = diagram();
  const claude = bedrockTools(runtime, {
    model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    ctx,
    tools: [queryTool],
  });
  const nova = bedrockTools(runtime, {
    model: "amazon.nova-pro-v1:0",
    ctx,
    tools: [queryTool],
  });
  const claudeSpec = claude.tools[0]?.toolSpec;
  const novaSpec = nova.tools[0]?.toolSpec;
  if (claudeSpec === undefined || novaSpec === undefined)
    throw new Error("expected Converse tools");
  return {
    claude: {
      name: claudeSpec.name,
      hasAnyOf: JSON.stringify(claudeSpec.inputSchema.json).includes("anyOf"),
    },
    nova: {
      name: novaSpec.name,
      additionalProperties: "additionalProperties" in novaSpec.inputSchema.json,
    },
  };
}

if (isMain(import.meta.url)) writeJson(bind());
