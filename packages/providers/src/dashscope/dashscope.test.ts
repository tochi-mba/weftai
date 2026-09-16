import { describe, expect, it } from "vitest";
import { bindProviderTools } from "../bind.js";
import { SAMPLE_PLAN, sampleCtx, sampleRuntime } from "../fixture.js";
import {
  dashscopeNativeKind,
  dashscopeNativeRequest,
  dashscopeTools,
  handleDashScopeToolCalls,
  toDashScopeNativeTools,
} from "./index.js";

describe("DashScope native Generation / MultiModal", () => {
  it("picks MultiModalConversation for qwen3.8 and Generation otherwise", () => {
    expect(dashscopeNativeKind("qwen-plus")).toBe("generation");
    expect(dashscopeNativeKind("qwen3.8-max")).toBe("multimodal");
  });

  it("builds result_format message payloads and handles tool_calls", async () => {
    const tools = dashscopeTools(sampleRuntime(), {
      model: "qwen-plus",
      region: "intl",
      ctx: sampleCtx,
      tools: [{ name: "query" }],
    });
    const request = dashscopeNativeRequest({
      model: "qwen-plus",
      messages: [{ role: "user", content: "查一下" }],
      tools,
      extraBody: { enable_thinking: false },
    });
    expect(request.kind).toBe("generation");
    expect(request.parameters.result_format).toBe("message");
    expect(request.parameters.enable_thinking).toBe(false);
    expect((request.parameters.tools as { function: { name: string } }[])[0]?.function.name).toBe(
      "query",
    );
    const multimodal = dashscopeNativeRequest({
      model: "qwen3.8-max",
      messages: [],
      tools,
    });
    expect(multimodal.kind).toBe("multimodal");
    const results = await handleDashScopeToolCalls(tools, [
      { function: { name: "query", arguments: SAMPLE_PLAN } },
      { function: { name: "nope", arguments: {} } },
      { function: { name: "query", arguments: "{" } },
    ]);
    expect(results[0]).toEqual({
      role: "tool",
      name: "query",
      content: expect.stringContaining("Alpha"),
    });
    expect(results[1]?.content).toContain("Unknown tool 'nope'");
    expect(results[2]?.content).toContain("not valid JSON");
    const none = await handleDashScopeToolCalls([], [{ function: { name: "q", arguments: {} } }]);
    expect(none[0]?.content).toContain("(none)");
    expect(
      toDashScopeNativeTools(
        bindProviderTools(sampleRuntime(), { ctx: sampleCtx, tools: [{ name: "q" }] }),
      )[0]?.function.name,
    ).toBe("q");
    expect(
      dashscopeTools(sampleRuntime(), { ctx: sampleCtx, tools: [{ name: "q" }] })[0]?.function.name,
    ).toBe("q");
  });

  it("rejects models that are not catalogued for native DashScope", () => {
    expect(() =>
      dashscopeTools(sampleRuntime(), { model: "gpt-4o", ctx: sampleCtx, tools: [{ name: "q" }] }),
    ).toThrow(/Unknown model/);
  });
});
