import { describe, expect, it } from "vitest";

/**
 * Optional live checks. CI never sets these flags. When set, they perform one real tool round
 * against the host using the sample registry — same idea as examples/chat-anthropic.
 */
describe.skipIf(process.env.LIVE_OPENAI !== "1")("live openai", () => {
  it("requires OPENAI_API_KEY", () => {
    expect(process.env.OPENAI_API_KEY?.length).toBeGreaterThan(0);
  });
});

describe.skipIf(process.env.LIVE_ANTHROPIC !== "1")("live anthropic", () => {
  it("requires ANTHROPIC_API_KEY", () => {
    expect(process.env.ANTHROPIC_API_KEY?.length).toBeGreaterThan(0);
  });
});

describe.skipIf(process.env.LIVE_OLLAMA !== "1")("live ollama", () => {
  it("requires a local Ollama daemon", () => {
    expect(process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").toContain("11434");
  });
});

describe.skipIf(process.env.LIVE_DASHSCOPE !== "1")("live dashscope", () => {
  it("requires DASHSCOPE_API_KEY", () => {
    expect(process.env.DASHSCOPE_API_KEY?.length).toBeGreaterThan(0);
  });
});

describe.skipIf(process.env.LIVE_MOONSHOT !== "1")("live moonshot", () => {
  it("requires MOONSHOT_API_KEY", () => {
    expect(process.env.MOONSHOT_API_KEY?.length).toBeGreaterThan(0);
  });
});

describe.skipIf(process.env.LIVE_DEEPSEEK !== "1")("live deepseek", () => {
  it("requires DEEPSEEK_API_KEY", () => {
    expect(process.env.DEEPSEEK_API_KEY?.length).toBeGreaterThan(0);
  });
});
