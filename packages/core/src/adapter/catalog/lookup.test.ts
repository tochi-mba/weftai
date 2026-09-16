import { describe, expect, it } from "vitest";
import { CAPABILITIES, capabilitiesFor, lookupCapability, requireCapability } from "./lookup.js";

describe("capability catalog", () => {
  it("has a provider, family, dialect and notes on every row", () => {
    expect(CAPABILITIES.length).toBeGreaterThan(20);
    for (const row of CAPABILITIES) {
      expect(row.provider.length).toBeGreaterThan(0);
      expect(row.api.length).toBeGreaterThan(0);
      expect(row.notes.length).toBeGreaterThan(10);
      expect(row.schemaDialect.length).toBeGreaterThan(0);
    }
  });

  it("lists both China and international URLs on Chinese presets that publish them", () => {
    const qwen = lookupCapability("qwen-plus", { provider: "dashscope", api: "chat.completions" });
    expect(qwen.ok).toBe(true);
    if (qwen.ok) {
      expect(qwen.baseURL).toContain("dashscope.aliyuncs.com");
      expect(qwen.capability.baseURLIntl).toContain("dashscope-intl");
    }
    const intl = lookupCapability("qwen-plus", {
      provider: "dashscope",
      api: "chat.completions",
      region: "intl",
    });
    expect(intl.ok).toBe(true);
    if (intl.ok) expect(intl.baseURL).toContain("dashscope-intl");
    const kimi = lookupCapability("kimi-k2", { provider: "moonshot" });
    expect(kimi.ok).toBe(true);
    if (kimi.ok) {
      expect(kimi.capability.baseURL).toContain("moonshot.cn");
      expect(kimi.capability.baseURLIntl).toContain("moonshot.ai");
    }
  });

  it("sends GPT-6 and GPT-5.4 reasoning to Responses, not Chat Completions", () => {
    const gpt6 = lookupCapability("gpt-6-astra");
    expect(gpt6.ok).toBe(true);
    if (gpt6.ok) expect(gpt6.capability.api).toBe("responses");
    const chat = lookupCapability("gpt-6-astra", { api: "chat.completions" });
    expect(chat.ok).toBe(false);
    if (!chat.ok) expect(chat.message).toContain("Responses");
    const gpt54 = lookupCapability("gpt-5.4", { api: "chat.completions" });
    expect(gpt54.ok).toBe(false);
    if (!gpt54.ok) expect(gpt54.message).toContain("Responses");
  });

  it("rejects Ollama tags that are not listed for tools", () => {
    const llama = lookupCapability("llama3.2");
    expect(llama.ok).toBe(true);
    const llava = lookupCapability("llava", { provider: "ollama" });
    expect(llava.ok).toBe(false);
    if (!llava.ok) expect(llava.message).toContain("ollama.com/search?c=tool");
  });

  it("names the Qwen stream+tools quirk", () => {
    const streamed = lookupCapability("qwen-plus", {
      provider: "dashscope",
      api: "chat.completions",
      stream: true,
    });
    expect(streamed.ok).toBe(false);
    if (!streamed.ok) expect(streamed.message).toContain("streamTools: false");
  });

  it("rejects Qianfan models whose tools are coming soon and names ERNIE", () => {
    const kimi = lookupCapability("kimi-k2", { provider: "qianfan" });
    expect(kimi.ok).toBe(false);
    if (!kimi.ok) expect(kimi.message).toContain("ERNIE");
  });

  it("requires a Doubao Ark endpoint id", () => {
    const ok = lookupCapability("ep-123", { provider: "ark" });
    expect(ok.ok).toBe(true);
    const bad = lookupCapability("doubao-seed", { provider: "ark" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toContain("ep-");
  });

  it("lists the three Hunyuan native models that accept Tools", () => {
    const turbos = lookupCapability("hunyuan-turbos", { api: "hunyuan.tc3" });
    expect(turbos.ok).toBe(true);
    const lite = lookupCapability("hunyuan-lite", { api: "hunyuan.tc3" });
    expect(lite.ok).toBe(false);
    if (!lite.ok) {
      expect(lite.message).toContain("hunyuan-turbos");
      expect(lite.message).toContain("hunyuan-functioncall");
    }
  });

  it("does not assume tools for Yi or deepseek-reasoner", () => {
    const yi = lookupCapability("yi-large");
    expect(yi.ok).toBe(false);
    if (!yi.ok) expect(yi.message).toContain("not confirmed");
    const reasoner = lookupCapability("deepseek-reasoner");
    expect(reasoner.ok).toBe(false);
    if (!reasoner.ok) expect(reasoner.message).toContain("deepseek-chat");
  });

  it("rejects tinyllama as json-mode-only", () => {
    const tiny = lookupCapability("tinyllama");
    expect(tiny.ok).toBe(false);
    if (!tiny.ok) expect(tiny.message).toContain("JSON mode");
  });

  it("explains an unknown model and a wrong family", () => {
    const unknown = lookupCapability("definitely-not-a-model");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.message).toContain("Unknown model");
    const wrong = lookupCapability("gpt-4o", { api: "ollama.chat" });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.message).toContain("does not speak ollama.chat");
  });

  it("filters by provider and lists rows", () => {
    expect(capabilitiesFor("moonshot").length).toBeGreaterThan(0);
    expect(lookupCapability("llama-3.3-70b-versatile", { provider: "groq" }).ok).toBe(true);
  });

  it("picks the more specific DashScope native row for qwen3.8 and throws from requireCapability", () => {
    const native = lookupCapability("qwen3.8-max", { provider: "dashscope" });
    expect(native.ok).toBe(true);
    if (native.ok) expect(native.capability.api).toBe("dashscope.native");
    expect(requireCapability("gpt-4o").api).toBe("chat.completions");
    expect(() => requireCapability("definitely-not-a-model")).toThrow(/Unknown model/);
  });

  it("round-trips a Chinese description in a catalog note", () => {
    const row = capabilitiesFor("stepfun")[0];
    expect(row?.notes).toContain("StepFun");
  });

  it("names the nearest working model when tools are absent, and has no alternative for Sonar", () => {
    const sonar = lookupCapability("sonar-pro", { provider: "perplexity" });
    expect(sonar.ok).toBe(false);
    if (!sonar.ok) expect(sonar.message).toContain("search-grounded");
    const unknown = lookupCapability("gpt-4p");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.message).toMatch(/Did you mean/);
  });

  it("falls back to the China URL when a row has no international endpoint", () => {
    const glm = lookupCapability("glm-5", { provider: "zhipu", region: "intl" });
    expect(glm.ok).toBe(true);
    if (glm.ok) expect(glm.baseURL).toContain("bigmodel.cn");
  });
});
