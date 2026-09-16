import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineOperation } from "../operation.js";
import { createRegistry } from "../registry.js";
import { createMemoryStore } from "../results/store.js";
import { ref } from "../schema/ref.js";
import { collection } from "../schema/types.js";
import { createRuntime } from "./runtime.js";
import { whenAborted } from "./signals.js";

const Node = z.object({ id: z.string(), label: z.string() });
const Nodes = collection("nodes", Node, { label: (n) => n.label, key: (n) => n.id });

function runtime(
  options: {
    failId?: string;
    store?: ReturnType<typeof createMemoryStore>;
    limits?: { stepTimeoutMs?: number; planTimeoutMs?: number; maxParallel?: number };
    failure?: "continue" | "abort";
  } = {},
) {
  const failId = options.failId ?? "boom";
  const find = defineOperation({
    name: "nodes.find",
    description: "Find.",
    input: z.object({ label: z.string().optional() }),
    output: Nodes,
    run: ({ step }) => {
      if (step.id === failId) throw new Error("nope");
      return [{ id: step.id, label: step.id }];
    },
  });
  const walk = defineOperation({
    name: "nodes.descendants",
    description: "Walk.",
    input: z.object({ from: ref(Nodes) }),
    output: Nodes,
    run: ({ input }) => [...input.from.items],
  });
  const hang = defineOperation({
    name: "nodes.hang",
    description: "Wait until cancelled.",
    input: z.object({}),
    output: Nodes,
    run: async ({ signal }) => {
      await whenAborted(signal);
      return [];
    },
  });
  return createRuntime({
    registry: createRegistry({ operations: [find, walk, hang] }),
    store: options.store,
    limits: options.limits,
    failure: options.failure,
  });
}

describe("createRuntime: failures", () => {
  it("skips dependents of a failed step and still finishes an independent branch", async () => {
    const rt = runtime({ failId: "a" });
    const result = await rt.execute(
      {
        steps: [
          { id: "a", op: "nodes.find" },
          { id: "b", op: "nodes.descendants", input: { from: "$a" } },
          { id: "c", op: "nodes.find" },
        ],
      },
      { ctx: {} },
    );
    expect(result.ok).toBe(false);
    expect(result.steps.map((s) => [s.id, s.status, s.error ?? s.skippedBecause])).toEqual([
      ["a", "error", "Step 'a' failed while running 'nodes.find': nope"],
      ["b", "skipped", "Skipped because step 'a' failed."],
      ["c", "ok", undefined],
    ]);
    expect(result.steps[2]?.items).toEqual([{ id: "c", label: "c" }]);
  });

  it("skips a chain when an ancestor was skipped", async () => {
    const rt = runtime({ failId: "a" });
    const result = await rt.execute(
      {
        steps: [
          { id: "a", op: "nodes.find" },
          { id: "b", op: "nodes.descendants", input: { from: "$a" } },
          { id: "c", op: "nodes.descendants", input: { from: "$b" } },
        ],
      },
      { ctx: {} },
    );
    expect(result.steps[2]?.skippedBecause).toBe("Skipped because step 'b' was skipped.");
  });

  it("aborts remaining work when the failure policy is abort", async () => {
    const find = defineOperation({
      name: "nodes.find",
      description: "Find.",
      input: z.object({ label: z.string().optional() }),
      output: Nodes,
      run: async ({ step, signal }) => {
        if (step.id === "fast") throw new Error("boom");
        await whenAborted(signal);
        return [{ id: step.id, label: step.id }];
      },
    });
    const rt = createRuntime({
      registry: createRegistry({ operations: [find] }),
      failure: "abort",
      limits: { maxParallel: 2, stepTimeoutMs: 5_000 },
    });
    const result = await rt.execute(
      {
        steps: [
          { id: "fast", op: "nodes.find" },
          { id: "slow", op: "nodes.find" },
        ],
      },
      { ctx: {} },
    );
    expect(result.ok).toBe(false);
    expect(result.steps.find((s) => s.id === "fast")?.status).toBe("error");
    expect(["error", "skipped"]).toContain(result.steps.find((s) => s.id === "slow")?.status);
  });

  it("fails a step that ignores the abort signal when it times out", async () => {
    const find = defineOperation({
      name: "nodes.find",
      description: "Find.",
      input: z.object({}),
      output: Nodes,
      run: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        return [];
      },
    });
    const rt = createRuntime({
      registry: createRegistry({ operations: [find] }),
      limits: { stepTimeoutMs: 20, planTimeoutMs: 5_000 },
    });
    const result = await rt.execute({ steps: [{ id: "a", op: "nodes.find" }] }, { ctx: {} });
    expect(result.steps[0]?.status).toBe("error");
    expect(result.steps[0]?.error).toBe(
      "Step 'a' timed out after 20ms. Narrow the query or raise the step timeout.",
    );
  });

  it("fails in-flight steps when the caller aborts", async () => {
    const controller = new AbortController();
    const rt = runtime({ limits: { stepTimeoutMs: 5_000 } });
    const pending = rt.execute(
      { steps: [{ id: "a", op: "nodes.hang" }] },
      {
        ctx: {},
        signal: controller.signal,
      },
    );
    controller.abort(new Error("stop"));
    const result = await pending;
    expect(result.steps[0]?.status).toBe("error");
    expect(result.steps[0]?.error).toBe("Step 'a' failed while running 'nodes.hang': stop");
  });

  it("surfaces a missing stored result at execution time", async () => {
    const store = createMemoryStore();
    const rt = createRuntime({
      registry: runtime().registry,
      store,
      hooks: {
        beforeStep({ step }) {
          if (step.id === "b") store.delete("s", "a");
        },
      },
    });
    await rt.execute({ steps: [{ id: "a", op: "nodes.find" }] }, { ctx: {}, session: { id: "s" } });
    const missing = await rt.execute(
      { steps: [{ id: "b", op: "nodes.descendants", input: { from: "$a" } }] },
      { ctx: {}, session: { id: "s" } },
    );
    expect(missing.steps[0]?.status).toBe("error");
    expect(missing.steps[0]?.error).toContain("no longer stored");
  });

  it("rejects a handler that returns the wrong shape", async () => {
    const find = defineOperation({
      name: "nodes.find",
      description: "Find.",
      input: z.object({}),
      output: Nodes,
      run: () => ({ id: "x", label: "x" }) as never,
    });
    const rt = createRuntime({ registry: createRegistry({ operations: [find] }) });
    const result = await rt.execute({ steps: [{ id: "a", op: "nodes.find" }] }, { ctx: {} });
    expect(result.steps[0]?.error).toContain("must return an array of nodes, not object");
  });
});
