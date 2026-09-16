import { describe, expect, it } from "vitest";
import { bindProviderTools } from "../bind.js";
import { SAMPLE_PLAN, sampleCtx, sampleRuntime } from "../fixture.js";
import { aiSdkTools, toAiSdkTools, wrapAiSdkTools } from "./index.js";

describe("Vercel AI SDK tool() wrapper", () => {
  it("exposes description, JSON Schema and execute without importing the SDK", async () => {
    const tools = aiSdkTools(sampleRuntime(), {
      ctx: sampleCtx,
      tools: [{ name: "query" }],
    });
    expect(tools[0]?.description).toContain("查找项目");
    expect(tools[0]?.inputSchema.type).toBe("object");
    expect(await tools[0]?.execute(SAMPLE_PLAN)).toContain("Alpha");
    const wrapped = wrapAiSdkTools(tools, (spec) => ({ kind: "ai", ...spec }));
    expect(wrapped[0]?.kind).toBe("ai");
    expect(
      toAiSdkTools(
        bindProviderTools(sampleRuntime(), { ctx: sampleCtx, tools: [{ name: "q" }] }),
      )[0]?.description,
    ).toContain("items.find");
  });
});
