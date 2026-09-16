import { describe, expect, it } from "vitest";
import { bindProviderTools } from "../bind.js";
import { SAMPLE_PLAN, sampleCtx, sampleRuntime } from "../fixture.js";
import { handleSparkFunctionCalls, sparkAuthUrl, sparkTools, toSparkFunctions } from "./index.js";

describe("Spark HMAC WebSocket tools", () => {
  it("emits function_definition and handles function calls", async () => {
    const mapped = sparkTools(sampleRuntime(), {
      model: "generalv3.5",
      ctx: sampleCtx,
      tools: [{ name: "query" }],
    });
    const unbound = sparkTools(sampleRuntime(), {
      ctx: sampleCtx,
      tools: [{ name: "query" }],
    });
    expect(unbound.function_definition[0]?.name).toBe("query");
    expect(mapped.function_definition[0]?.name).toBe("query");
    expect(mapped.function_definition[0]?.description).toContain("查找项目");
    const results = await handleSparkFunctionCalls(mapped.function_definition, [
      { name: "query", arguments: SAMPLE_PLAN },
      { name: "nope", arguments: {} },
      { name: "query", arguments: "{" },
    ]);
    expect(results[0]?.content).toContain("Alpha");
    expect(results[1]?.content).toContain("Unknown tool 'nope'");
    expect(results[2]?.content).toContain("not valid JSON");
    const none = await handleSparkFunctionCalls([], [{ name: "q", arguments: {} }]);
    expect(none[0]?.content).toContain("(none)");
  });

  it("builds a classic HMAC authorization URL", () => {
    const date = "Thu, 01 Jan 2026 00:00:00 GMT";
    const url = sparkAuthUrl({
      host: "spark-api.xf-yun.com",
      path: "/v3.5/chat",
      apiKey: "key",
      apiSecret: "secret",
      date,
    });
    expect(url.startsWith("wss://spark-api.xf-yun.com/v3.5/chat?")).toBe(true);
    expect(url).toContain("host=spark-api.xf-yun.com");
    expect(url).toContain("authorization=");
    const post = sparkAuthUrl({
      host: "spark-api.xf-yun.com",
      path: "/v3.5/chat",
      apiKey: "key",
      apiSecret: "secret",
      date,
      method: "POST",
    });
    expect(post).not.toBe(url);
    expect(
      toSparkFunctions(
        bindProviderTools(sampleRuntime(), { ctx: sampleCtx, tools: [{ name: "q" }] }),
      ).function_definition[0]?.name,
    ).toBe("q");
  });
});
