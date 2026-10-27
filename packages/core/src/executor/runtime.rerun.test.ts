import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DefinitionError } from "../errors.js";
import { defineOperationFor } from "../operation.js";
import { buildRerun, createMemoryPlanStore } from "../plan/rerun.js";
import { validatePlan } from "../plan/validate.js";
import { createRegistry } from "../registry.js";
import { createMemoryStore } from "../results/store.js";
import { ref } from "../schema/ref.js";
import { collection, value } from "../schema/types.js";
import { createRuntime } from "./runtime.js";

const Node = z.object({ id: z.string(), label: z.string() });
const Nodes = collection("nodes", Node, { label: (n) => n.label, key: (n) => n.id });
type Ctx = { readonly calls: string[] };
const define = defineOperationFor<Ctx>();

const find = define({
  name: "nodes.find",
  description: "Find nodes.",
  input: z.object({ q: z.string().default("") }),
  output: Nodes,
  run: ({ input, ctx }) => {
    ctx.calls.push(`find:${input.q}`);
    return [
      { id: "1", label: "A" },
      { id: "2", label: "B" },
    ];
  },
});
const pick = define({
  name: "nodes.pick",
  description: "Pick nodes, or fail when asked to.",
  input: z.object({ from: ref(Nodes), fail: z.boolean().default(false) }),
  output: Nodes,
  run: ({ input, ctx }) => {
    ctx.calls.push("pick");
    if (input.fail) throw new Error("wrong input");
    return [...input.from.items];
  },
});
const save = define({
  name: "nodes.save",
  description: "Save nodes.",
  effects: "write",
  input: z.object({ nodes: ref(Nodes) }),
  output: value(z.object({ saved: z.number() })),
  run: ({ input, ctx }) => {
    ctx.calls.push("save");
    return { saved: input.nodes.count };
  },
});
const registry = createRegistry({ operations: [find, pick, save] });

/** A failing middle step: `a` and `d` succeed, `b` fails, `c` (reads `b`) is skipped. */
const FIRST = {
  steps: [
    { id: "a", op: "nodes.find", input: { q: "x" } },
    { id: "b", op: "nodes.pick", input: { from: "$a", fail: true } },
    { id: "c", op: "nodes.pick", input: { from: "$b" } },
    { id: "d", op: "nodes.find", input: { q: "y" } },
  ],
};
const FIXED_B = { id: "b", op: "nodes.pick", input: { from: "$a" } };

async function ranOnce() {
  const runtime = createRuntime({ registry });
  const ctx: Ctx = { calls: [] };
  const first = await runtime.execute(FIRST, { ctx });
  expect(first.steps.map((s) => s.status)).toEqual(["ok", "error", "skipped", "ok"]);
  ctx.calls.length = 0;
  return { runtime, ctx };
}

describe("rerun", () => {
  it("runs the replaced step and what reads it; everything else is reused, not run", async () => {
    const { runtime, ctx } = await ranOnce();
    const result = await runtime.execute({ rerun: "b", steps: [FIXED_B] }, { ctx });
    expect(result.ok).toBe(true);
    expect(ctx.calls).toEqual(["pick", "pick"]);
    expect(result.steps.map((s) => [s.id, s.status, s.reused === true])).toEqual([
      ["a", "ok", true],
      ["b", "ok", false],
      ["c", "ok", false],
      ["d", "ok", true],
    ]);
    expect(result.rerun).toEqual({ of: "b", ran: ["b", "c"], reused: ["a", "d"] });
    expect(result.text).toContain("a (nodes): 2 matched (reused from the earlier run)");
    expect(result.text).toContain("c (nodes): 2 matched");
    expect(result.trace.steps.find((s) => s.id === "a")?.reused).toBe(true);
  });

  it("with no steps, retries what failed or was skipped", async () => {
    const ctx: Ctx = { calls: [] };
    let failing = true;
    const flaky = define({
      name: "nodes.flaky",
      description: "Fails once.",
      input: z.object({ from: ref(Nodes) }),
      output: Nodes,
      run: ({ input }) => {
        if (failing) throw new Error("try again");
        return [...input.from.items];
      },
    });
    const withFlaky = createRuntime({ registry: createRegistry({ operations: [find, flaky] }) });
    const plan = {
      steps: [
        { id: "a", op: "nodes.find" },
        { id: "b", op: "nodes.flaky", input: { from: "$a" } },
      ],
    };
    expect((await withFlaky.execute(plan, { ctx })).ok).toBe(false);
    failing = false;
    ctx.calls.length = 0;
    const result = await withFlaky.execute({ rerun: "a", steps: [] }, { ctx });
    expect(result.ok).toBe(true);
    expect(result.rerun).toEqual({ of: "a", ran: ["b"], reused: ["a"] });
    expect(ctx.calls).toEqual([]);
  });

  it("a changed read runs again, and so does every step downstream of it", async () => {
    const { runtime, ctx } = await ranOnce();
    await runtime.execute({ rerun: "b", steps: [FIXED_B] }, { ctx });
    ctx.calls.length = 0;
    const result = await runtime.execute(
      { rerun: "a", steps: [{ id: "a", op: "nodes.find", input: { q: "z" } }] },
      { ctx },
    );
    expect(result.rerun?.ran).toEqual(["a", "b", "c"]);
    expect(ctx.calls).toEqual(["find:z", "pick", "pick"]);
  });

  it("refuses to repeat a write that succeeded, unless the rerun names it", async () => {
    const runtime = createRuntime({ registry });
    const ctx: Ctx = { calls: [] };
    await runtime.execute(
      {
        steps: [
          { id: "a", op: "nodes.find" },
          { id: "w", op: "nodes.save", input: { nodes: "$a" } },
        ],
      },
      { ctx },
    );
    ctx.calls.length = 0;
    const changeA = { id: "a", op: "nodes.find", input: { q: "new" } };
    const refused = await runtime.execute({ rerun: "a", steps: [changeA] }, { ctx });
    expect(refused.ok).toBe(false);
    expect(refused.issues).toEqual([
      {
        code: "rerun.write_would_repeat",
        stepId: "w",
        message:
          "Step 'w' already wrote, and rerunning would write again because step 'a', which it reads, runs again.",
        hint: "Put 'w' in steps to run it again on purpose, or send a new plan.",
      },
    ]);
    expect(ctx.calls).toEqual([]);
    const sameW = { id: "w", op: "nodes.save", input: { nodes: "$a" } };
    const allowed = await runtime.execute({ rerun: "a", steps: [changeA, sameW] }, { ctx });
    expect(allowed.ok).toBe(true);
    expect(ctx.calls).toEqual(["find:new", "save"]);
  });

  it("a reused step whose stored result has gone runs again; a write in that state is refused", async () => {
    let now = 0;
    const store = createMemoryStore({ ttlMs: 100, now: () => now });
    const runtime = createRuntime({ registry, store });
    const ctx: Ctx = { calls: [] };
    await runtime.execute(FIRST, { ctx });
    now = 1000;
    ctx.calls.length = 0;
    const result = await runtime.execute({ rerun: "b", steps: [FIXED_B] }, { ctx });
    expect(result.rerun?.ran).toEqual(["a", "b", "c", "d"]);
    expect(ctx.calls).toEqual(["find:x", "find:y", "pick", "pick"]);

    const writes = createRuntime({
      registry,
      store: createMemoryStore({ ttlMs: 100, now: () => now }),
    });
    now = 0;
    await writes.execute(
      {
        steps: [
          { id: "a", op: "nodes.find" },
          { id: "w", op: "nodes.save", input: { nodes: "$a" } },
          { id: "e", op: "nodes.find", input: { q: "later" } },
        ],
      },
      { ctx },
    );
    now = 1000;
    // `a` lost its result, so it runs; `w` reads it, so `w` would write again.
    const refused = await writes.execute({ rerun: "e", steps: [] }, { ctx });
    expect(refused.issues?.map((i) => [i.stepId, i.message])).toEqual([
      [
        "w",
        "Step 'w' already wrote, and rerunning would write again because step 'a', which it reads, runs again.",
      ],
    ]);

    // A write whose own result is gone, with nothing upstream running, says so.
    const stamp = define({
      name: "nodes.stamp",
      description: "Record a stamp.",
      effects: "write",
      input: z.object({}),
      output: value(z.object({ ok: z.boolean() })),
      run: () => ({ ok: true }),
    });
    const alone = createRuntime({
      registry: createRegistry({ operations: [find, stamp] }),
      store: createMemoryStore({ ttlMs: 100, now: () => now }),
    });
    now = 0;
    await alone.execute(
      {
        steps: [
          { id: "s", op: "nodes.stamp" },
          { id: "g", op: "nodes.find" },
        ],
      },
      { ctx },
    );
    now = 1000;
    const gone = await alone.execute({ rerun: "g", steps: [] }, { ctx });
    expect(gone.issues?.[0]?.message).toBe(
      "Step 's' already wrote, and rerunning would write again because its stored result is gone.",
    );
  });

  it("adds a step with a new id at the end, where it can read reused and rerun steps", async () => {
    const { runtime, ctx } = await ranOnce();
    const result = await runtime.execute(
      {
        rerun: "b",
        steps: [FIXED_B, { id: "e", op: "nodes.pick", input: { from: "$d" } }],
      },
      { ctx },
    );
    expect(result.steps.map((s) => s.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(result.rerun?.ran).toEqual(["b", "c", "e"]);
  });

  it("finds the latest plan a step id belongs to", async () => {
    const { runtime, ctx } = await ranOnce();
    await runtime.execute(
      { steps: [{ id: "a", op: "nodes.find", input: { q: "solo" } }] },
      { ctx },
    );
    ctx.calls.length = 0;
    const result = await runtime.execute({ rerun: "a", steps: [] }, { ctx });
    expect(result.steps.map((s) => s.id)).toEqual(["a"]);
    expect(result.rerun).toEqual({ of: "a", ran: [], reused: ["a"] });
  });

  it("names what is wrong: an unknown step, an empty plain plan, duplicate ids, no plan store", async () => {
    const { runtime, ctx } = await ranOnce();
    const unknown = await runtime.execute({ rerun: "bb", steps: [] }, { ctx });
    expect(unknown.issues).toEqual([
      {
        code: "rerun.unknown_plan",
        message: "No earlier plan in this session has a step named 'bb'.",
        hint: "Did you mean 'b'?",
      },
    ]);
    const far = await runtime.execute({ rerun: "zzzzzzzz", steps: [] }, { ctx });
    expect(far.issues?.[0]?.hint).toBe("Send the whole plan.");

    const empty = await runtime.execute({ steps: [] }, { ctx });
    expect(empty.issues?.[0]?.message).toBe(
      "The plan is malformed: input.steps: Too small: expected array to have >=1 items.",
    );
    expect((await runtime.execute({ steps: [], rerun: null }, { ctx })).issues?.[0]?.code).toBe(
      "plan.invalid_shape",
    );

    const twice = await runtime.execute({ rerun: "b", steps: [FIXED_B, FIXED_B] }, { ctx });
    expect(twice.issues?.[0]).toMatchObject({ code: "step.duplicate_id", stepId: "b" });

    const keepsNone = createRuntime({ registry, plans: null });
    await keepsNone.execute(FIRST, { ctx });
    const refused = await keepsNone.execute({ rerun: "b", steps: [FIXED_B] }, { ctx });
    expect(refused.issues).toEqual([
      {
        code: "rerun.not_kept",
        message: "This runtime keeps no earlier plans to rerun.",
        hint: "Send the whole plan.",
      },
    ]);
    expect(validatePlan({ rerun: "b", steps: [] }, registry).ok).toBe(false);
  });

  it("validates the built plan like a new one", async () => {
    const { runtime, ctx } = await ranOnce();
    const result = await runtime.execute(
      { rerun: "b", steps: [{ id: "b", op: "nodes.pick", input: { from: "$nope" } }] },
      { ctx },
    );
    expect(result.issues?.[0]?.code).toBe("ref.unknown_target");
  });

  it("lets a host build the plan first and see exactly what will run", async () => {
    const { runtime, ctx } = await ranOnce();
    const plans = createMemoryPlanStore();
    const built = buildRerun({ rerun: "b", steps: [FIXED_B] }, registry, {
      plans,
      store: runtime.store,
      sessionId: "default",
    });
    // A fresh plan store has not seen the first plan.
    expect(built.ok).toBe(false);

    const shared = createMemoryPlanStore();
    const host = createRuntime({ registry, plans: shared });
    await host.execute(FIRST, { ctx });
    const seen = buildRerun({ rerun: "b", steps: [FIXED_B] }, registry, {
      plans: shared,
      store: host.store,
      sessionId: "default",
    });
    expect(seen.ok && seen.reused).toEqual(["a", "d"]);
    expect(seen.ok && seen.steps.map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
    const plain = buildRerun(FIRST, registry, {
      plans: shared,
      store: host.store,
      sessionId: "default",
    });
    expect(plain.ok && plain.of).toBeUndefined();
    const bad = buildRerun({ nope: 1 }, registry, {
      plans: shared,
      store: host.store,
      sessionId: "default",
    });
    expect(bad.ok).toBe(false);
  });

  it("keeps one session's plans from another", async () => {
    const runtime = createRuntime({ registry });
    const ctx: Ctx = { calls: [] };
    await runtime.execute(FIRST, { ctx, session: { id: "one" } });
    const other = await runtime.execute(
      { rerun: "b", steps: [FIXED_B] },
      { ctx, session: { id: "two" } },
    );
    expect(other.issues?.[0]?.code).toBe("rerun.unknown_plan");
  });
});

describe("memory plan store", () => {
  it("forgets plans past their time and beyond its cap, oldest first", () => {
    let now = 0;
    const plans = createMemoryPlanStore({ ttlMs: 100, maxPlans: 2, now: () => now });
    const record = (id: string) => ({
      steps: [{ id, op: "nodes.find", input: {} }],
      outcome: {},
      storedAt: now,
    });
    plans.set("s", record("a"));
    plans.set("s", record("b"));
    plans.set("s", record("c"));
    expect(plans.ids("s")).toEqual(["b", "c"]);
    expect(plans.get("s", "a")).toBeUndefined();
    now = 500;
    expect(plans.get("s", "b")).toBeUndefined();
    expect(plans.ids("s")).toEqual([]);
    plans.set("s", record("d"));
    plans.clear("s");
    expect(plans.ids("s")).toEqual([]);
  });

  it("refuses limits that make no sense", () => {
    expect(() => createMemoryPlanStore({ ttlMs: 0 })).toThrow(DefinitionError);
    expect(() => createMemoryPlanStore({ maxPlans: 0 })).toThrow(
      "Plan store maxPlans must be an integer of at least 1, not 0.",
    );
    expect(() => createMemoryPlanStore({ ttlMs: Number.NaN })).toThrow(
      "Plan store ttlMs must be a positive number or Infinity, not NaN.",
    );
    expect(() => createMemoryPlanStore({ maxPlans: 1.5 })).toThrow(/not 1\.5\.$/);
    expect(() => createMemoryPlanStore({ ttlMs: Number.NEGATIVE_INFINITY })).toThrow(
      /not -Infinity\.$/,
    );
    expect(() => createMemoryPlanStore({ ttlMs: 0 })).toThrow(
      /ttlMs must be a positive number or Infinity, not 0\.$/,
    );
  });
});
