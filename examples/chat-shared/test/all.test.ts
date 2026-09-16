import { PRESETS } from "@weftai/providers/openai";
import { describe, expect, it } from "vitest";
import { bind as bindAiSdk } from "../../chat-ai-sdk/src/index.js";
import { bind as bindAnthropic } from "../../chat-anthropic/src/bind.js";
import { bind as bindAzure } from "../../chat-azure/src/index.js";
import { bind as bindBedrock } from "../../chat-bedrock/src/index.js";
import { bind as bindCohere } from "../../chat-cohere/src/index.js";
import { bind as bindDashScope } from "../../chat-dashscope/src/index.js";
import { bind as bindGemini } from "../../chat-gemini/src/index.js";
import { bind as bindHunyuan } from "../../chat-hunyuan/src/index.js";
import { bind as bindOllama } from "../../chat-ollama/src/index.js";
import { bind as bindOpenAI } from "../../chat-openai/src/index.js";
import { bind as bindAllPresets } from "../../chat-presets/src/index.js";
import { bind as bindQwen } from "../../chat-qwen/src/index.js";
import { bind as bindSpark } from "../../chat-spark/src/index.js";

describe("chat examples", () => {
  it("binds a supply-chain tool in every wire-format family", () => {
    const openai = bindOpenAI();
    expect(openai.responses.name).toBe("query_supply_chain");
    expect(openai.chat.name).toBe("query_supply_chain");
    expect(bindAzure().name).toBe("query_supply_chain");
    expect(bindAnthropic().name).toBe("query_supply_chain");
    const gemini = bindGemini();
    expect(gemini.generateContent.name).toBe("query_supply_chain");
    expect(gemini.interactions.type).toBe("function");
    expect(bindBedrock().nova.additionalProperties).toBe(false);
    expect(bindOllama().name).toBe("query_supply_chain");
    expect(bindCohere().name).toBe("query_supply_chain");
    expect(bindDashScope().generation).toBe("generation");
    expect(bindHunyuan().ToolChoice).toBe("auto");
    expect(bindSpark().name).toBe("query_supply_chain");
    expect(bindAiSdk().schemaType).toBe("object");
    expect(bindQwen().name).toBe("query_supply_chain");
  });

  it("covers every OpenAI-compat preset, including Chinese CN/intl hosts", () => {
    const rows = bindAllPresets();
    const names = new Set(rows.map((row) => row.preset));
    for (const key of Object.keys(PRESETS)) expect(names.has(key)).toBe(true);
    expect(rows.find((row) => row.preset === "qwen")?.baseURLIntl).toContain("dashscope-intl");
    expect(rows.find((row) => row.preset === "ark")?.provider).toBe("ark");
    expect(rows.every((row) => row.tool === "query_supply_chain")).toBe(true);
  });
});
