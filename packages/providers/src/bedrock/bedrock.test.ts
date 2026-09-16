import { describe, expect, it } from "vitest";
import { bindProviderTools } from "../bind.js";
import { SAMPLE_PLAN, sampleCtx, sampleRuntime } from "../fixture.js";
import { bedrockTools, handleBedrockToolUses, toConverseToolConfig } from "./index.js";

describe("Bedrock Converse", () => {
  it("wraps tools as toolSpec.inputSchema.json and returns toolResult blocks", async () => {
    const config = bedrockTools(sampleRuntime(), {
      model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
      ctx: sampleCtx,
      tools: [{ name: "query" }],
    });
    expect(config.tools[0]?.toolSpec).toMatchObject({
      name: "query",
      inputSchema: { json: expect.objectContaining({ type: "object" }) },
    });
    expect(config.tools[0]?.toolSpec.strict).toBeUndefined();
    const results = await handleBedrockToolUses(config, [
      { toolUseId: "t1", name: "query", input: SAMPLE_PLAN },
      { toolUseId: "t2", name: "nope", input: {} },
      { toolUseId: "t3", name: "query", input: "{" },
    ]);
    expect(results[0]?.toolResult).toEqual({
      toolUseId: "t1",
      content: [{ text: expect.stringContaining("Alpha") }],
      status: "success",
    });
    expect(results[1]?.toolResult.status).toBe("error");
    expect(results[1]?.toolResult.content[0]?.text).toContain("Unknown tool 'nope'");
    expect(results[2]?.toolResult.status).toBe("error");
    const empty = await handleBedrockToolUses({ tools: [] }, [
      { toolUseId: "x", name: "q", input: {} },
    ]);
    expect(empty[0]?.toolResult.content[0]?.text).toContain("(none)");
  });

  it("compiles the Nova-restricted dialect and can mark toolSpec.strict", () => {
    const nova = bedrockTools(sampleRuntime(), {
      model: "amazon.nova-pro-v1:0",
      ctx: sampleCtx,
      tools: [{ name: "query" }],
    });
    expect("additionalProperties" in (nova.tools[0]?.toolSpec.inputSchema.json ?? {})).toBe(false);
    const strict = bedrockTools(sampleRuntime(), {
      ctx: sampleCtx,
      tools: [{ name: "query" }],
      strict: true,
    });
    expect(strict.tools[0]?.toolSpec.strict).toBe(true);
    const bound = bindProviderTools(sampleRuntime(), { ctx: sampleCtx, tools: [{ name: "q" }] });
    expect(toConverseToolConfig(bound).tools[0]?.toolSpec.name).toBe("q");
  });

  it("uses Converse for any Bedrock model id, with Nova as a dialect", () => {
    const claude = bedrockTools(sampleRuntime(), {
      model: "anthropic.claude-3-haiku-20240307-v1:0",
      ctx: sampleCtx,
      tools: [{ name: "query" }],
    });
    expect(claude.tools[0]?.toolSpec.name).toBe("query");
  });
});
