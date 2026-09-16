import { describe, expect, it } from "vitest";
import { bindProviderTools } from "../bind.js";
import { SAMPLE_PLAN, sampleCtx, sampleRuntime } from "../fixture.js";
import { cohereTools, handleCohereToolCalls, toCohereTools } from "./index.js";

describe("Cohere Chat v2", () => {
  it("returns citation documents wrapping Weftai text", async () => {
    const tools = cohereTools(sampleRuntime(), {
      model: "command-a",
      ctx: sampleCtx,
      tools: [{ name: "query" }],
    });
    expect(tools[0]).toMatchObject({ type: "function", function: { name: "query" } });
    const results = await handleCohereToolCalls(tools, [
      { id: "c1", type: "function", function: { name: "query", arguments: SAMPLE_PLAN } },
      { id: "c2", function: { name: "nope", arguments: {} } },
      { id: "c3", function: { name: "query", arguments: "{" } },
    ]);
    expect(results[0]?.content[0]?.document.data.text).toContain("Alpha");
    expect(results[1]?.content[0]?.document.data.text).toContain("Unknown tool 'nope'");
    expect(results[2]?.content[0]?.document.data.text).toContain("not valid JSON");
    const none = await handleCohereToolCalls(
      [],
      [{ id: "x", function: { name: "q", arguments: {} } }],
    );
    expect(none[0]?.content[0]?.document.data.text).toContain("(none)");
    expect(
      toCohereTools(
        bindProviderTools(sampleRuntime(), { ctx: sampleCtx, tools: [{ name: "q" }] }),
      )[0]?.function.name,
    ).toBe("q");
    expect(
      cohereTools(sampleRuntime(), { ctx: sampleCtx, tools: [{ name: "q" }] })[0]?.function.name,
    ).toBe("q");
  });

  it("rejects models that are not catalogued for Cohere", () => {
    expect(() =>
      cohereTools(sampleRuntime(), { model: "gpt-4o", ctx: sampleCtx, tools: [{ name: "q" }] }),
    ).toThrow(/Unknown model/);
  });
});
