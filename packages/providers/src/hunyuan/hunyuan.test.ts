import { describe, expect, it } from "vitest";
import { bindProviderTools } from "../bind.js";
import { SAMPLE_PLAN, sampleCtx, sampleRuntime } from "../fixture.js";
import {
  handleHunyuanToolCalls,
  hunyuanAuthorization,
  hunyuanTools,
  toHunyuanTools,
} from "./index.js";

describe("Hunyuan TC3 ChatCompletions", () => {
  it("emits Tools with ToolChoice auto and never forces custom", async () => {
    const mapped = hunyuanTools(sampleRuntime(), {
      model: "hunyuan-turbos",
      ctx: sampleCtx,
      tools: [{ name: "query" }],
    });
    expect(mapped.ToolChoice).toBe("auto");
    expect(mapped.Tools[0]?.Type).toBe("function");
    expect(mapped.Tools[0]?.Function.Name).toBe("query");
    expect(mapped.Tools[0]?.Function.Description).toContain("查找项目");
    const schema = JSON.parse(mapped.Tools[0]?.Function.Parameters ?? "{}") as { type: string };
    expect(schema.type).toBe("object");
    const results = await handleHunyuanToolCalls(mapped.Tools, [
      { Id: "c1", Function: { Name: "query", Arguments: SAMPLE_PLAN } },
      { Function: { Name: "nope", Arguments: {} } },
      { Function: { Name: "query", Arguments: "{" } },
    ]);
    expect(results[0]).toEqual({
      Role: "tool",
      ToolCallId: "c1",
      Content: expect.stringContaining("Alpha"),
    });
    expect(results[1]?.ToolCallId).toBe("call_1");
    expect(results[1]?.Content).toContain("Unknown tool 'nope'");
    expect(results[2]?.Content).toContain("not valid JSON");
    const none = await handleHunyuanToolCalls([], [{ Function: { Name: "q", Arguments: {} } }]);
    expect(none[0]?.Content).toContain("(none)");
  });

  it("signs ChatCompletions with TC3-HMAC-SHA256", () => {
    const first = hunyuanAuthorization({
      secretId: "AKIDtest",
      secretKey: "secret",
      payload: '{"Model":"hunyuan-turbos"}',
      timestamp: 1_700_000_000,
    });
    const again = hunyuanAuthorization({
      secretId: "AKIDtest",
      secretKey: "secret",
      payload: '{"Model":"hunyuan-turbos"}',
      timestamp: 1_700_000_000,
    });
    expect(first.authorization).toBe(again.authorization);
    expect(first.authorization.startsWith("TC3-HMAC-SHA256 Credential=AKIDtest/")).toBe(true);
    expect(first.authorization).toContain("SignedHeaders=content-type;host;x-tc-action");
    expect(first.hashedPayload).toMatch(/^[a-f0-9]{64}$/);
    const other = hunyuanAuthorization({
      secretId: "AKIDtest",
      secretKey: "secret",
      payload: '{"Model":"other"}',
      timestamp: 1_700_000_000,
      region: "ap-guangzhou",
      service: "hunyuan",
      action: "ChatCompletions",
      host: "hunyuan.tencentcloudapi.com",
    });
    expect(other.authorization).not.toBe(first.authorization);
    expect(other.credentialScope).toContain("ap-guangzhou");
  });

  it("lists the native models that accept Tools", () => {
    expect(() =>
      hunyuanTools(sampleRuntime(), {
        model: "hunyuan-lite",
        ctx: sampleCtx,
        tools: [{ name: "q" }],
      }),
    ).toThrow(/hunyuan-turbos/);
    expect(
      toHunyuanTools(bindProviderTools(sampleRuntime(), { ctx: sampleCtx, tools: [{ name: "q" }] }))
        .Tools[0]?.Function.Name,
    ).toBe("q");
    expect(
      hunyuanTools(sampleRuntime(), { ctx: sampleCtx, tools: [{ name: "q" }] }).Tools[0]?.Function
        .Name,
    ).toBe("q");
  });
});
