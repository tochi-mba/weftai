import { describe, expect, it } from "vitest";
import { bindProviderTools, findBound } from "./bind.js";
import { SAMPLE_PLAN, sampleCtx, sampleRuntime } from "./fixture.js";

describe("bindProviderTools", () => {
  it("binds named tools onto one session and finds them by name", async () => {
    const runtime = sampleRuntime();
    const tools = bindProviderTools(runtime, {
      ctx: sampleCtx,
      session: { id: "s" },
      tools: [{ name: "query", include: (op) => op.effects === "read" }],
    });
    expect(findBound(tools, "query")?.name).toBe("query");
    expect(findBound(tools, "missing")).toBeUndefined();
    const text = await tools[0]?.handle(SAMPLE_PLAN);
    expect(text).toContain("Alpha");
    expect(tools[0]?.description).toContain("查找项目");
    expect(runtime.store.get("s", "all")?.count).toBe(1);
    const [writer] = bindProviderTools(runtime, {
      ctx: sampleCtx,
      session: { id: "w" },
      tools: [{ name: "all" }],
    });
    const written = await writer?.handle({ steps: [{ id: "out", op: "items.write" }] });
    expect(written).toContain("out (items): 0 matched");
  });

  it("allocates a session when none is provided", async () => {
    const runtime = sampleRuntime();
    const [tool] = bindProviderTools(runtime, { ctx: sampleCtx, tools: [{ name: "q" }] });
    await tool?.handle(SAMPLE_PLAN);
    expect(tool?.description).toContain("items.find");
  });
});
