import { describe, expect, it } from "vitest";
import { collection, createRegistry, createRuntime, defineOperation, z } from "weftai";
import { toToolDefinition, weftaiTools } from "./tool-runner.js";

const Item = z.object({ id: z.string(), label: z.string() });
const Items = collection("items", Item, {
  label: (item) => item.label,
  key: (item) => item.id,
});
type Ctx = { readonly items: readonly z.infer<typeof Item>[] };

const find = defineOperation({
  name: "items.find",
  description: "Find items by label.",
  input: z.object({ q: z.string().default("") }),
  output: Items,
  run: ({ input, ctx }: { input: { q: string }; ctx: Ctx }) =>
    input.q === "" ? ctx.items : ctx.items.filter((item) => item.label.includes(input.q)),
});
const select = defineOperation({
  name: "selection.select",
  description: "Select items.",
  input: z.object({}),
  output: Items,
  effects: "write" as const,
  run: () => [],
});
const registry = createRegistry<Ctx>({ operations: [find, select] });
const items = [{ id: "a", label: "Alpha" }];

describe("Anthropic toolRunner", () => {
  it("builds runnable tools whose run returns formatted text", async () => {
    const runtime = createRuntime({ registry });
    const tools = weftaiTools(runtime, {
      ctx: { items },
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
    const text = await query.run({ steps: [{ id: "all", op: "items.find", input: {} }] });
    expect(text).toContain("all (items): 1 matched");
    expect(runtime.store.get("s1", "all")?.count).toBe(1);
  });

  it("spreads eager_input_streaming and custom descriptions", () => {
    const runtime = createRuntime({ registry });
    const [eager] = weftaiTools(runtime, {
      ctx: { items },
      tools: [{ name: "query", eagerInputStreaming: true, description: "Custom." }],
    });
    expect(eager?.eager_input_streaming).toBe(true);
    expect(eager?.description).toBe("Custom.");
    expect(eager?.type).toBe("custom");
    const [plain] = weftaiTools(runtime, { ctx: { items }, tools: [{ name: "q" }] });
    expect(plain?.eager_input_streaming).toBeUndefined();
  });

  it("resolves a context factory and keeps one session per bind", async () => {
    let calls = 0;
    const runtime = createRuntime({ registry });
    const [tool] = weftaiTools(runtime, {
      ctx: async () => {
        calls += 1;
        return { items };
      },
      session: { id: "conv" },
      tools: [{ name: "query" }, { name: "act", include: (op) => op.effects === "write" }],
    });
    await tool?.handle({ steps: [{ id: "a", op: "items.find" }] });
    await tool?.handle({ steps: [{ id: "b", op: "items.find" }] });
    expect(calls).toBe(2);
    expect(runtime.store.get("conv", "a")?.count).toBe(1);
    const [first] = weftaiTools(runtime, { ctx: { items }, tools: [{ name: "q" }] });
    const [second] = weftaiTools(runtime, { ctx: { items }, tools: [{ name: "q" }] });
    await first?.handle({ steps: [{ id: "x", op: "items.find" }] });
    await second?.handle({ steps: [{ id: "y", op: "items.find" }] });
    expect(runtime.store.get("default", "x")).toBeUndefined();
  });

  it("enforces include and allowWrites as model-facing text", async () => {
    const runtime = createRuntime({ registry });
    const [query] = weftaiTools(runtime, {
      ctx: { items },
      tools: [{ name: "query", include: (op) => op.effects === "read" }],
    });
    expect(await query?.handle({ steps: [{ id: "s", op: "selection.select" }] })).toContain(
      "Unknown operation 'selection.select'",
    );
    const [writes] = weftaiTools(runtime, {
      ctx: { items },
      tools: [{ name: "all", allowWrites: false }],
    });
    expect(await writes?.handle({ steps: [{ id: "s", op: "selection.select" }] })).toContain(
      "changes state and cannot be used in this tool",
    );
    const [tool] = weftaiTools(runtime, { ctx: { items }, tools: [{ name: "q" }] });
    expect(await tool?.handle({ steps: [{ id: "a", op: "items.fnd" }] })).toBe(
      "Step 'a': Unknown operation 'items.fnd'. Did you mean 'items.find'?",
    );
    expect(await tool?.handle({ nope: true })).toContain("Could not read this plan");
  });

  it("keeps parse() for the SDK tool runner and relaxes strict when asked", () => {
    const runtime = createRuntime({ registry });
    const [tool] = weftaiTools(runtime, { ctx: { items }, tools: [{ name: "q", strict: false }] });
    expect(tool?.strict).toBe(false);
    expect(() => tool?.parse({ steps: [{ id: "a", operation: "items.find" }] })).toThrow();
    if (tool === undefined) throw new Error("missing tool");
    expect(tool.parse({ steps: [{ id: "a", op: "items.find" }] })).toEqual({
      steps: [{ id: "a", op: "items.find", input: {} }],
    });
    type Schema = { steps: { items: { anyOf: Record<string, unknown>[] } } };
    expect((tool.input_schema.properties as Schema).steps.items.anyOf[0]?.required).toEqual([
      "id",
      "op",
    ]);
    const [closed] = weftaiTools(runtime, { ctx: { items }, tools: [{ name: "q" }] });
    if (closed === undefined) throw new Error("missing closed tool");
    expect((closed.input_schema.properties as Schema).steps.items.anyOf[0]?.required).toEqual([
      "id",
      "op",
      "input",
    ]);
  });

  it("toToolDefinition is usable in a manual loop", async () => {
    const runtime = createRuntime({ registry });
    const def = toToolDefinition(
      runtime,
      { name: "query", include: (op) => op.effects === "read", eagerInputStreaming: true },
      { ctx: { items }, session: { id: "manual" } },
    );
    expect(def.eager_input_streaming).toBe(true);
    expect(
      await def.handle({ steps: [{ id: "all", op: "items.find", input: { q: "Alph" } }] }),
    ).toContain("Alpha");
    expect(runtime.store.get("manual", "all")?.count).toBe(1);
    const plain = toToolDefinition(runtime, { name: "q" }, { ctx: { items } });
    expect("eager_input_streaming" in plain).toBe(false);
  });
});
