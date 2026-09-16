import { describe, expect, it } from "vitest";
import { z } from "zod";
import { RefResolutionError } from "../errors.js";
import { defineOperationFor } from "../operation.js";
import { createRegistry } from "../registry.js";
import { ref } from "../schema/ref.js";
import { collection } from "../schema/types.js";
import { createRuntime } from "./runtime.js";

const Node = z.object({ id: z.string(), label: z.string() });
type Node = z.infer<typeof Node>;
const Nodes = collection("nodes", Node, {
  label: (n) => n.label,
  key: (n) => n.id,
  fields: () => [{ name: "label", get: (n: Node) => n.label }],
});
type Ctx = { readonly nodes: readonly Node[]; readonly failWith?: unknown };
const define = defineOperationFor<Ctx>();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const find = define({
  name: "nodes.find",
  description: "Find.",
  input: z.object({ delayMs: z.number().default(0) }),
  output: Nodes,
  run: async ({ input, ctx }) => {
    if (input.delayMs > 0) await sleep(input.delayMs);
    return ctx.nodes;
  },
});
const pass = define({
  name: "nodes.pass",
  description: "Pass through.",
  input: z.object({ from: ref(Nodes) }),
  output: Nodes,
  run: ({ input }) => input.from.items,
});
const throwing = define({
  name: "nodes.throw",
  description: "Throw whatever the context says.",
  input: z.object({}),
  output: Nodes,
  run: ({ ctx }) => {
    throw ctx.failWith;
  },
});
const shown = define({
  name: "nodes.shown",
  description: "Show fields.",
  input: z.object({ from: ref(Nodes), all: z.boolean().default(false) }),
  output: Nodes,
  run: ({ input, showFields }) => {
    showFields(input.all ? "all" : ["label"]);
    return input.from.items;
  },
});
const write = define({
  name: "nodes.write",
  description: "Write.",
  input: z.object({}),
  output: Nodes,
  effects: "write",
  run: () => [],
});

const registry = createRegistry({ operations: [find, pass, throwing, shown, write] });
const ctx: Ctx = { nodes: [{ id: "1", label: "A" }] };

describe("runtime: cancellation and timeouts", () => {
  it("skips every step when the caller's signal is already aborted", async () => {
    const runtime = createRuntime({ registry });
    const result = await runtime.execute(
      {
        steps: [
          { id: "a", op: "nodes.find" },
          { id: "b", op: "nodes.pass", input: { from: "$a" } },
        ],
      },
      { ctx, signal: AbortSignal.abort() },
    );
    expect(result.ok).toBe(false);
    expect(result.steps.map((s) => s.status)).toEqual(["skipped", "skipped"]);
    expect(result.steps[0]?.skippedBecause).toBe("Skipped because the plan was cancelled.");
    expect(result.text).toContain("a: skipped");
  });

  it("times out the whole plan, fails the running step and skips the rest with the reason", async () => {
    const runtime = createRuntime({ registry, limits: { planTimeoutMs: 30, stepTimeoutMs: 1000 } });
    const result = await runtime.execute(
      {
        steps: [
          { id: "slow", op: "nodes.find", input: { delayMs: 200 } },
          { id: "after", op: "nodes.pass", input: { from: "$slow" } },
        ],
      },
      { ctx },
    );
    expect(result.steps[0]?.status).toBe("error");
    expect(result.steps[0]?.error).toBe(
      "The plan timed out after 30ms. Split the work across calls or raise the plan timeout.",
    );
    expect(result.steps[1]?.status).toBe("skipped");
    expect(result.steps[1]?.skippedBecause).toBe(
      "The plan timed out after 30ms. Split the work across calls or raise the plan timeout.",
    );
  });

  it("times out one step without affecting an independent one", async () => {
    const runtime = createRuntime({ registry, limits: { stepTimeoutMs: 30 } });
    const result = await runtime.execute(
      {
        steps: [
          { id: "slow", op: "nodes.find", input: { delayMs: 200 } },
          { id: "quick", op: "nodes.find" },
        ],
      },
      { ctx },
    );
    expect(result.steps[0]?.error).toBe(
      "Step 'slow' timed out after 30ms. Narrow the query or raise the step timeout.",
    );
    expect(result.steps[1]?.status).toBe("ok");
    expect(result.ok).toBe(false);
  });

  it("reports the duration and start time of every step", async () => {
    const before = Date.now();
    const result = await createRuntime({ registry }).execute(
      { steps: [{ id: "a", op: "nodes.find", input: { delayMs: 20 } }] },
      { ctx },
    );
    const step = result.steps[0];
    expect(step?.startedAt).toBeGreaterThanOrEqual(before);
    expect(step?.durationMs).toBeGreaterThanOrEqual(15);
    expect(result.durationMs).toBeGreaterThanOrEqual(step?.durationMs ?? 0);
  });
});

describe("runtime: error wrapping", () => {
  const failing = (failWith: unknown) =>
    createRuntime({ registry }).execute(
      { steps: [{ id: "x", op: "nodes.throw" }] },
      { ctx: { nodes: [], failWith } },
    );

  it("wraps an Error with its message", async () => {
    const result = await failing(new TypeError("bad thing"));
    expect(result.steps[0]?.error).toBe("Step 'x' failed while running 'nodes.throw': bad thing");
  });

  it("wraps a non-Error and an empty message generically", async () => {
    expect((await failing("just a string")).steps[0]?.error).toBe(
      "Step 'x' failed while running 'nodes.throw'.",
    );
    expect((await failing(new Error(""))).steps[0]?.error).toBe(
      "Step 'x' failed while running 'nodes.throw'.",
    );
    expect((await failing(undefined)).steps[0]?.error).toBe(
      "Step 'x' failed while running 'nodes.throw'.",
    );
  });

  it("treats an AbortError thrown by a handler as a cancellation", async () => {
    const abort = new DOMException("stopped", "AbortError");
    expect((await failing(abort)).steps[0]?.error).toBe("Step 'x' was cancelled.");
    const named = new Error("stopped");
    named.name = "AbortError";
    expect((await failing(named)).steps[0]?.error).toBe("Step 'x' was cancelled.");
  });

  it("passes framework errors through verbatim", async () => {
    const result = await failing(new RefResolutionError("$y", "'$y' is gone.", "x"));
    expect(result.steps[0]?.error).toBe("'$y' is gone.");
  });
});

describe("runtime: display and policies", () => {
  it("records the fields a handler asked to show", async () => {
    const runtime = createRuntime({ registry });
    const result = await runtime.execute(
      {
        steps: [
          { id: "a", op: "nodes.find" },
          { id: "some", op: "nodes.shown", input: { from: "$a" } },
          { id: "all", op: "nodes.shown", input: { from: "$a", all: true } },
        ],
      },
      { ctx },
    );
    expect(result.steps[1]?.fields).toEqual(["label"]);
    expect(Object.isFrozen(result.steps[1]?.fields)).toBe(true);
    expect(result.steps[2]?.fields).toBe("all");
    expect(result.steps[0]?.fields).toBeUndefined();
  });

  it("rejects write operations when the call disallows them", async () => {
    const runtime = createRuntime({ registry });
    const result = await runtime.execute(
      { steps: [{ id: "w", op: "nodes.write" }] },
      { ctx, allowWrites: false },
    );
    expect(result.ok).toBe(false);
    expect(result.issues?.[0]?.code).toBe("step.write_not_allowed");
    expect(result.steps).toEqual([]);
    expect(result.trace.issues?.[0]?.code).toBe("step.write_not_allowed");
    const allowed = await runtime.execute({ steps: [{ id: "w", op: "nodes.write" }] }, { ctx });
    expect(allowed.ok).toBe(true);
  });

  it("exposes the registry and store it was built with", () => {
    const runtime = createRuntime({ registry });
    expect(runtime.registry).toBe(registry);
    expect(runtime.store.list("default")).toEqual([]);
  });

  it("uses the default session when none is given and isolates named sessions", async () => {
    const runtime = createRuntime({ registry });
    await runtime.execute({ steps: [{ id: "a", op: "nodes.find" }] }, { ctx });
    await runtime.execute(
      { steps: [{ id: "b", op: "nodes.find" }] },
      { ctx, session: { id: "s2" } },
    );
    expect(runtime.store.list("default").map((r) => r.id)).toEqual(["a"]);
    expect(runtime.store.list("s2").map((r) => r.id)).toEqual(["b"]);
  });
});
