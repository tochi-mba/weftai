import { collection, createRegistry, createRuntime, defineOperation, z } from "agentweft";
import { describe, expect, it } from "vitest";
import { agentweftTools, toToolDefinition } from "./index.js";

const Item = z.object({ id: z.string(), label: z.string() });
const Items = collection("items", Item, {
  label: (item) => item.label,
  key: (item) => item.id,
});

const find = defineOperation({
  name: "items.find",
  description: "Find items by label.",
  input: z.object({ q: z.string().default("") }),
  output: Items,
  run: ({ input }) =>
    input.q === ""
      ? [{ id: "a", label: "Alpha" }]
      : [{ id: "a", label: "Alpha" }].filter((item) => item.label.includes(input.q)),
});

const select = defineOperation({
  name: "selection.select",
  description: "Select items.",
  input: z.object({}),
  output: Items,
  effects: "write" as const,
  run: () => [{ id: "a", label: "Alpha" }],
});

const registry = createRegistry({ operations: [find, select] });

describe("@agentweft/anthropic", () => {
  it("builds runnable tools whose run returns formatted text", async () => {
    const runtime = createRuntime({ registry });
    const tools = agentweftTools(runtime, {
      ctx: {},
      session: { id: "s1" },
      tools: [
        { name: "query", include: (op) => op.effects === "read" },
        { name: "select", include: (op) => op.name === "selection.select" },
      ],
    });
    expect(tools.map((tool) => tool.name)).toEqual(["query", "select"]);
    const query = tools[0];
    if (query === undefined) throw new Error("missing query tool");
    expect(query.strict).toBe(true);
    expect(query.description).toContain("items.find");
    expect(query.description).not.toContain("selection.select");
    expect(query.input_schema).toMatchObject({
      type: "object",
      required: ["steps"],
      additionalProperties: false,
    });

    const text = await query.run({
      steps: [{ id: "all", op: "items.find", input: {} }],
    });
    expect(text).toContain("all (items): 1 matched");
    expect(text).toContain("1. Alpha");
    expect(runtime.store.get("s1", "all")?.count).toBe(1);
  });

  it("spreads eager_input_streaming when requested", () => {
    const runtime = createRuntime({ registry });
    const [tool] = agentweftTools(runtime, {
      ctx: {},
      tools: [{ name: "query", eagerInputStreaming: true }],
    });
    expect(tool?.eager_input_streaming).toBe(true);
  });

  it("toToolDefinition is usable in a manual loop", async () => {
    const runtime = createRuntime({ registry });
    const def = toToolDefinition(
      runtime,
      { name: "query", include: (op) => op.effects === "read", strict: true },
      { ctx: {}, session: { id: "manual" } },
    );
    expect(def).toEqual(
      expect.objectContaining({
        name: "query",
        strict: true,
      }),
    );
    expect(def.input_schema).toMatchObject({ type: "object" });
    const text = await def.handle({
      steps: [{ id: "all", op: "items.find", input: { q: "Alph" } }],
    });
    expect(text).toContain("Alpha");
  });
});
