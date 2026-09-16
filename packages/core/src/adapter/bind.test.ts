import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createRuntime } from "../executor/runtime.js";
import { defineOperation } from "../operation.js";
import { createRegistry } from "../registry.js";
import { ref } from "../schema/ref.js";
import { collection } from "../schema/types.js";
import { bindTool, formatInvalidPlan, parseToolArguments, resolveCtx } from "./bind.js";

const Item = z.object({ id: z.string(), label: z.string() });
const Items = collection("items", Item, { label: (item) => item.label, key: (item) => item.id });
type Ctx = { readonly items: readonly z.infer<typeof Item>[] };

const find = defineOperation({
  name: "items.find",
  description: "查找项目",
  input: z.object({ q: z.string().default("") }),
  output: Items,
  run: ({ input, ctx }: { input: { q: string }; ctx: Ctx }) =>
    ctx.items.filter((item) => item.label.includes(input.q)),
});
const write = defineOperation({
  name: "items.write",
  description: "Write.",
  input: z.object({}),
  output: Items,
  effects: "write" as const,
  run: () => [],
});
const registry = createRegistry<Ctx>({ operations: [find, write] });
const ctx: Ctx = { items: [{ id: "a", label: "Alpha" }] };

describe("bindTool", () => {
  it("executes a plan and returns model-facing text", async () => {
    const runtime = createRuntime({ registry });
    const tool = bindTool(runtime, { name: "query" }, { ctx, sessionId: "s" });
    expect(tool.name).toBe("query");
    expect(tool.dialect).toBe("union");
    expect(tool.description).toContain("items.find");
    expect(tool.description).toContain("查找项目");
    const text = await tool.handle({ steps: [{ id: "all", op: "items.find" }] });
    expect(text).toContain("all (items): 1 matched");
    expect(text).toContain("Alpha");
    expect(runtime.store.get("s", "all")?.count).toBe(1);
  });

  it("returns text for a malformed plan unless onInvalid is throw", async () => {
    const runtime = createRuntime({ registry });
    const textTool = bindTool(runtime, { name: "q" }, { ctx, sessionId: "s" });
    const text = await textTool.handle({ nope: true });
    expect(text.startsWith("Could not read this plan.")).toBe(true);
    const thrown = bindTool(runtime, { name: "q", onInvalid: "throw" }, { ctx, sessionId: "s" });
    await expect(thrown.handle({ nope: true })).rejects.toThrow();
  });

  it("scopes include and allowWrites at execute time", async () => {
    const runtime = createRuntime({ registry });
    const tool = bindTool(
      runtime,
      { name: "q", include: (op) => op.effects === "read", allowWrites: false },
      { ctx, sessionId: "s" },
    );
    const unknown = await tool.execute({ steps: [{ id: "w", op: "items.write" }] });
    expect(unknown.ok).toBe(false);
    expect(unknown.text).toContain("Unknown operation 'items.write'");
  });

  it("resolves an async context factory", async () => {
    const runtime = createRuntime({ registry });
    let calls = 0;
    const tool = bindTool(
      runtime,
      { name: "q" },
      {
        ctx: async () => {
          calls += 1;
          return ctx;
        },
        sessionId: "s",
      },
    );
    await tool.handle({ steps: [{ id: "all", op: "items.find" }] });
    expect(calls).toBe(1);
  });

  it("shares a session so a later tool can $ref an earlier result", async () => {
    const take = defineOperation({
      name: "items.take",
      description: "Reuse a previous result.",
      input: z.object({ from: ref(Items) }),
      output: Items,
      run: ({ input }) => input.from.items,
    });
    const runtime = createRuntime({
      registry: createRegistry<Ctx>({ operations: [find, take] }),
    });
    const query = bindTool(runtime, { name: "q" }, { ctx, sessionId: "s" });
    const next = bindTool(runtime, { name: "n" }, { ctx, sessionId: "s" });
    await query.handle({ steps: [{ id: "found", op: "items.find" }] });
    const text = await next.handle({
      steps: [{ id: "again", op: "items.take", input: { from: "$found" } }],
    });
    expect(text).toContain("again (items): 1 matched");
    expect(text).toContain("Alpha");
  });
});

describe("resolveCtx", () => {
  it("returns a value or the result of a factory", async () => {
    expect(await resolveCtx(4)).toBe(4);
    expect(await resolveCtx(() => 5)).toBe(5);
    expect(await resolveCtx(async () => 6)).toBe(6);
  });
});

describe("formatInvalidPlan", () => {
  it("names the path and handles an empty issue list", () => {
    expect(formatInvalidPlan([])).toBe("Could not read this plan: the value is not a plan.");
    expect(formatInvalidPlan([{ path: [], message: "Required." }])).toBe(
      "Could not read this plan. the plan: Required.",
    );
    expect(formatInvalidPlan([{ path: ["steps", 0], message: "Bad." }])).toBe(
      "Could not read this plan. 'steps.0': Bad.",
    );
  });
});

describe("parseToolArguments", () => {
  it("accepts objects, empty strings and JSON strings", () => {
    expect(parseToolArguments({ a: 1 })).toEqual({ ok: true, value: { a: 1 } });
    expect(parseToolArguments(undefined)).toEqual({ ok: true, value: {} });
    expect(parseToolArguments(null)).toEqual({ ok: true, value: {} });
    expect(parseToolArguments("")).toEqual({ ok: true, value: {} });
    expect(parseToolArguments('{"steps":[]}')).toEqual({ ok: true, value: { steps: [] } });
  });

  it("rejects numbers, booleans, invalid JSON and other types", () => {
    expect(parseToolArguments(3).ok).toBe(false);
    expect(parseToolArguments(true).ok).toBe(false);
    expect(parseToolArguments(1n).ok).toBe(false);
    const invalid = parseToolArguments("{");
    expect(invalid.ok).toBe(false);
    if (invalid.ok === false) expect(invalid.message).toContain("not valid JSON");
  });
});
