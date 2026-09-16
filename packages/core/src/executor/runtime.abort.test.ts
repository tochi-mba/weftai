import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineOperationFor } from "../operation.js";
import { createRegistry } from "../registry.js";
import { ref } from "../schema/ref.js";
import { collection } from "../schema/types.js";
import { createRuntime } from "./runtime.js";

const Node = z.object({ id: z.string(), label: z.string() });
const Nodes = collection("nodes", Node, { label: (n) => n.label, key: (n) => n.id });
type Ctx = Record<string, never>;
const define = defineOperationFor<Ctx>();
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const slow = define({
  name: "nodes.slow",
  description: "Slow.",
  input: z.object({ delayMs: z.number().default(200) }),
  output: Nodes,
  run: async ({ input }) => {
    await sleep(input.delayMs);
    return [];
  },
});
const pass = define({
  name: "nodes.pass",
  description: "Pass.",
  input: z.object({ from: ref(Nodes) }),
  output: Nodes,
  run: ({ input }) => input.from.items,
});
const registry = createRegistry({ operations: [slow, pass] });

describe("runtime: abort mid-level", () => {
  it("skips a step that had not started yet when the plan times out within its level", async () => {
    const runtime = createRuntime({
      registry,
      limits: { planTimeoutMs: 30, stepTimeoutMs: 5000, maxParallel: 1 },
    });
    const result = await runtime.execute(
      {
        steps: [
          { id: "first", op: "nodes.slow" },
          { id: "second", op: "nodes.slow" },
        ],
      },
      { ctx: {} },
    );
    expect(result.steps[0]?.status).toBe("error");
    expect(result.steps[0]?.error).toContain("The plan timed out after 30ms.");
    expect(result.steps[1]?.status).toBe("skipped");
    expect(result.steps[1]?.skippedBecause).toContain("The plan timed out after 30ms.");
  });

  it("reports a caller abort with a non-Error reason as a cancellation", async () => {
    const runtime = createRuntime({ registry, limits: { maxParallel: 1 } });
    const controller = new AbortController();
    setTimeout(() => controller.abort("user pressed stop"), 10);
    const result = await runtime.execute(
      {
        steps: [
          { id: "a", op: "nodes.slow" },
          { id: "b", op: "nodes.slow" },
          { id: "c", op: "nodes.pass", input: { from: "$a" } },
        ],
      },
      { ctx: {}, signal: controller.signal },
    );
    expect(result.steps[0]?.error).toBe("Step 'a' was cancelled.");
    expect(result.steps[1]?.skippedBecause).toBe("Skipped because the plan was cancelled.");
    expect(result.steps[2]?.skippedBecause).toBe("Skipped because the plan was cancelled.");
    expect(result.text).toContain("a: failed\n  Step 'a' was cancelled.");
  });

  it("passes an Error abort reason through as the step error", async () => {
    const runtime = createRuntime({ registry });
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error("shutting down")), 10);
    const result = await runtime.execute(
      { steps: [{ id: "a", op: "nodes.slow" }] },
      { ctx: {}, signal: controller.signal },
    );
    expect(result.steps[0]?.error).toBe(
      "Step 'a' failed while running 'nodes.slow': shutting down",
    );
  });
});
