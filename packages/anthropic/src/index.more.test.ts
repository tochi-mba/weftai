import { describe, expect, it } from "vitest";
import { collection, createRegistry, createRuntime, defineOperation, z } from "weftai";
import { toToolDefinition, weftaiTools } from "./index.js";

const Item = z.object({ id: z.string(), label: z.string() });
const Items = collection("items", Item, { label: (item) => item.label, key: (item) => item.id });
type Ctx = { readonly items: readonly z.infer<typeof Item>[] };

const find = defineOperation({
  name: "items.find",
  description: "Find items.",
  input: z.object({ q: z.string().default("") }),
  output: Items,
  run: ({ input, ctx }: { input: { q: string }; ctx: Ctx }) =>
    ctx.items.filter((item) => item.label.includes(input.q)),
});
const select = defineOperation({
  name: "selection.select",
  description: "Select.",
  input: z.object({}),
  output: Items,
  effects: "write" as const,
  run: () => [],
});
const registry = createRegistry<Ctx>({ operations: [find, select] });
const items = [{ id: "a", label: "Alpha" }];

describe("@weftai/anthropic: contexts and sessions", () => {
  it("resolves a context factory on every call, including async ones", async () => {
    let calls = 0;
    const runtime = createRuntime({ registry });
    const [tool] = weftaiTools(runtime, {
      ctx: async () => {
        calls += 1;
        return { items };
      },
      tools: [{ name: "query" }],
    });
    if (tool === undefined) throw new Error("missing");
    await tool.handle({ steps: [{ id: "a", op: "items.find" }] });
    await tool.handle({ steps: [{ id: "b", op: "items.find" }] });
    expect(calls).toBe(2);
  });

  it("gives each weftaiTools call its own session unless one is provided", async () => {
    const runtime = createRuntime({ registry });
    const [first] = weftaiTools(runtime, { ctx: { items }, tools: [{ name: "q" }] });
    const [second] = weftaiTools(runtime, { ctx: { items }, tools: [{ name: "q" }] });
    await first?.handle({ steps: [{ id: "x", op: "items.find" }] });
    await second?.handle({ steps: [{ id: "y", op: "items.find" }] });
    const sessions = new Set<string>();
    for (const id of ["x", "y"]) {
      let found = false;
      for (const session of ["default"]) {
        if (runtime.store.get(session, id) !== undefined) found = true;
      }
      expect(found).toBe(false);
    }
    expect(sessions.size).toBe(0);
  });

  it("shares the session between tools from one call so a later tool can reference an earlier result", async () => {
    const runtime = createRuntime({ registry });
    const tools = weftaiTools(runtime, {
      ctx: { items },
      session: { id: "conv" },
      tools: [
        { name: "query", include: (op) => op.effects === "read" },
        { name: "act", include: (op) => op.effects === "write" },
      ],
    });
    await tools[0]?.handle({ steps: [{ id: "found", op: "items.find" }] });
    expect(runtime.store.get("conv", "found")?.count).toBe(1);
    const text = await tools[1]?.handle({ steps: [{ id: "s", op: "selection.select" }] });
    expect(text).toContain("s (items): 0 matched");
  });
});

describe("@weftai/anthropic: policies and schema", () => {
  it("rejects write operations in a read-only tool as text, not an exception", async () => {
    const runtime = createRuntime({ registry });
    const [query] = weftaiTools(runtime, {
      ctx: { items },
      tools: [{ name: "query", include: (op) => op.effects === "read" }],
    });
    const text = await query?.handle({ steps: [{ id: "s", op: "selection.select" }] });
    expect(text).toContain("Unknown operation 'selection.select'");
    expect(text).toContain("Available operations: items.find.");
    expect(runtime.store.get("default", "s")).toBeUndefined();
  });

  it("enforces the include scope for read operations too, not only in the description", async () => {
    const runtime = createRuntime({ registry });
    const [onlySelect] = weftaiTools(runtime, {
      ctx: { items },
      tools: [{ name: "act", include: (op) => op.effects === "write" }],
    });
    const text = await onlySelect?.handle({ steps: [{ id: "a", op: "items.find" }] });
    expect(text).toContain("Unknown operation 'items.find'");
  });

  it("honours an explicit allowWrites: false even when writes are included", async () => {
    const runtime = createRuntime({ registry });
    const [tool] = weftaiTools(runtime, {
      ctx: { items },
      tools: [{ name: "all", allowWrites: false }],
    });
    const text = await tool?.handle({ steps: [{ id: "s", op: "selection.select" }] });
    expect(text).toContain("changes state and cannot be used in this tool");
  });

  it("returns validation problems as text the model can act on", async () => {
    const runtime = createRuntime({ registry });
    const [tool] = weftaiTools(runtime, { ctx: { items }, tools: [{ name: "q" }] });
    const text = await tool?.handle({ steps: [{ id: "a", op: "items.fnd" }] });
    expect(text).toBe("Step 'a': Unknown operation 'items.fnd'. Did you mean 'items.find'?");
  });

  it("parse rejects a malformed plan before anything runs", () => {
    const runtime = createRuntime({ registry });
    const [tool] = weftaiTools(runtime, { ctx: { items }, tools: [{ name: "q" }] });
    expect(() => tool?.parse({ steps: [{ id: "a", operation: "items.find" }] })).toThrow();
    expect(() => tool?.parse("nope")).toThrow();
    expect(tool?.parse({ steps: [{ id: "a", op: "items.find" }] })).toEqual({
      steps: [{ id: "a", op: "items.find", input: {} }],
    });
  });

  it("handle rejects a malformed plan with a thrown error", async () => {
    const runtime = createRuntime({ registry });
    const [tool] = weftaiTools(runtime, { ctx: { items }, tools: [{ name: "q" }] });
    await expect(tool?.handle({ nope: true })).rejects.toThrow();
  });

  it("relaxes the schema when strict is false", () => {
    const runtime = createRuntime({ registry });
    const [loose] = weftaiTools(runtime, {
      ctx: { items },
      tools: [{ name: "q", strict: false }],
    });
    if (loose === undefined) throw new Error("missing tool");
    expect(loose.strict).toBe(false);
    type Schema = { steps: { items: { anyOf: Record<string, unknown>[] } } };
    const variants = (loose.input_schema.properties as Schema).steps.items.anyOf;
    expect(variants[0]?.required).toEqual(["id", "op"]);
    const [strict] = weftaiTools(runtime, { ctx: { items }, tools: [{ name: "q" }] });
    if (strict === undefined) throw new Error("missing tool");
    const strictVariants = (strict.input_schema.properties as Schema).steps.items.anyOf;
    expect(strictVariants[0]?.required).toEqual(["id", "op", "input"]);
  });

  it("uses a custom description verbatim", () => {
    const runtime = createRuntime({ registry });
    const [tool] = weftaiTools(runtime, {
      ctx: { items },
      tools: [{ name: "q", description: "Custom." }],
    });
    expect(tool?.description).toBe("Custom.");
    expect(tool?.type).toBe("custom");
    expect(tool?.eager_input_streaming).toBeUndefined();
  });

  it("toToolDefinition carries eager streaming and a session", async () => {
    const runtime = createRuntime({ registry });
    const def = toToolDefinition(
      runtime,
      { name: "q", eagerInputStreaming: true },
      { ctx: { items }, session: { id: "manual" } },
    );
    expect(def.eager_input_streaming).toBe(true);
    await def.handle({ steps: [{ id: "m", op: "items.find" }] });
    expect(runtime.store.get("manual", "m")?.count).toBe(1);
    const plain = toToolDefinition(runtime, { name: "q" }, { ctx: { items } });
    expect("eager_input_streaming" in plain).toBe(false);
  });
});
