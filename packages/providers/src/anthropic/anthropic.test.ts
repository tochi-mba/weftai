import { describe, expect, it } from "vitest";
import { SAMPLE_PLAN, sampleCtx, sampleRuntime } from "../fixture.js";
import { anthropicTools, handleToolUseBlocks } from "./index.js";

describe("Anthropic Messages tools", () => {
  it("emits input_schema and tool_result blocks without setting tool_choice", async () => {
    const tools = anthropicTools(sampleRuntime(), {
      ctx: sampleCtx,
      session: { id: "s" },
      tools: [{ name: "query_diagram", include: (op) => op.effects === "read" }],
    });
    expect(tools[0]?.name).toBe("query_diagram");
    expect(tools[0]?.description).toContain("查找项目");
    expect(await tools[0]?.handle(SAMPLE_PLAN)).toContain("Alpha");
    expect(tools[0]?.input_schema).toMatchObject({ type: "object", required: ["steps"] });
    const results = await handleToolUseBlocks(tools, [
      { type: "tool_use", id: "toolu_1", name: "query_diagram", input: SAMPLE_PLAN },
      { id: "toolu_2", name: "nope", input: {} },
    ]);
    expect(results[0]).toEqual({
      type: "tool_result",
      tool_use_id: "toolu_1",
      content: expect.stringContaining("Alpha"),
      is_error: false,
    });
    expect(results[1]?.is_error).toBe(true);
    expect(results[1]?.content).toContain("Unknown tool 'nope'");
    const empty = await handleToolUseBlocks([], [{ id: "x", name: "q", input: {} }]);
    expect(empty[0]?.content).toContain("(none)");
  });
});
