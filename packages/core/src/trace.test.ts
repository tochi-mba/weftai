import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createRuntime } from "./executor/runtime.js";
import type { StepResult } from "./executor/types.js";
import { defineOperation } from "./operation.js";
import { createRegistry } from "./registry.js";
import { ref } from "./schema/ref.js";
import { collection } from "./schema/types.js";
import { buildTrace, TRACE_VERSION } from "./trace.js";

const Node = z.object({ id: z.string(), label: z.string() });
const Nodes = collection("nodes", Node, { label: (n) => n.label, key: (n) => n.id });
const find = defineOperation({
  name: "nodes.find",
  description: "Find.",
  input: z.object({ label: z.string().optional() }),
  output: Nodes,
  run: () => [
    { id: "1", label: "A" },
    { id: "2", label: "B" },
  ],
});
const pick = defineOperation({
  name: "nodes.pick",
  description: "Pick.",
  input: z.object({ from: ref(Nodes), extra: z.array(ref(Nodes)).default([]) }),
  output: Nodes,
  run: ({ input }) => input.from.items,
});
const registry = createRegistry({ operations: [find, pick] });

describe("buildTrace", () => {
  it("records inputs with references replaced by their count, plus timing and dependencies", async () => {
    const result = await createRuntime({ registry }).execute(
      {
        steps: [
          { id: "a", op: "nodes.find", input: { label: "x" } },
          { id: "b", op: "nodes.pick", input: { from: "$a[1]", extra: ["$a"] } },
        ],
      },
      { ctx: {} },
    );
    expect(result.trace.version).toBe(TRACE_VERSION);
    expect(result.trace.ok).toBe(true);
    expect(result.trace.issues).toBeUndefined();
    expect(result.trace.durationMs).toBe(result.durationMs);
    const [a, b] = result.trace.steps;
    expect(a).toMatchObject({
      id: "a",
      operation: "nodes.find",
      status: "ok",
      dependencies: [],
      input: { label: "x" },
      output: { kind: "collection", type: "nodes", count: 2 },
      notices: [],
      error: undefined,
      skippedBecause: undefined,
    });
    expect(b?.dependencies).toEqual(["a"]);
    expect(b?.input).toEqual({
      from: { ref: "$a[1]", count: 2 },
      extra: [{ ref: "$a", count: 2 }],
    });
    expect(JSON.stringify(result.trace)).not.toContain('"id":"1"');
  });

  it("records validation issues with no steps", async () => {
    const result = await createRuntime({ registry }).execute(
      { steps: [{ id: "a", op: "nodes.nope" }] },
      { ctx: {} },
    );
    expect(result.trace.ok).toBe(false);
    expect(result.trace.steps).toEqual([]);
    expect(result.trace.issues?.[0]?.code).toBe("step.unknown_operation");
  });

  it("omits output for failed and skipped steps and keeps their reasons", () => {
    const failed: StepResult = {
      id: "x",
      operation: "nodes.find",
      status: "error",
      kind: undefined,
      type: undefined,
      count: undefined,
      data: undefined,
      items: undefined,
      notices: ["n"],
      fields: undefined,
      error: "boom",
      skippedBecause: undefined,
      durationMs: 3,
      startedAt: 1,
      referenced: false,
      present: "full",
      replaced: false,
    };
    const skipped: StepResult = {
      ...failed,
      id: "y",
      status: "skipped",
      error: undefined,
      skippedBecause: "dep",
    };
    const trace = buildTrace({
      ok: false,
      durationMs: 9,
      steps: [failed, skipped],
      validated: undefined,
      issues: undefined,
    });
    expect(trace.steps[0]).toMatchObject({
      output: undefined,
      error: "boom",
      notices: ["n"],
      input: undefined,
      dependencies: [],
    });
    expect(trace.steps[1]).toMatchObject({ output: undefined, skippedBecause: "dep" });
  });

  it("leaves a reference count undefined when the target never produced a result", async () => {
    const result = await createRuntime({ registry }).execute(
      {
        steps: [
          { id: "a", op: "nodes.find" },
          { id: "b", op: "nodes.pick", input: { from: "$a" } },
        ],
      },
      { ctx: {}, signal: AbortSignal.abort() },
    );
    expect(result.trace.steps[1]?.input).toEqual({
      from: { ref: "$a", count: undefined },
      extra: [],
    });
  });

  it("is plain JSON", async () => {
    const result = await createRuntime({ registry }).execute(
      { steps: [{ id: "a", op: "nodes.find" }] },
      { ctx: {} },
    );
    expect(JSON.parse(JSON.stringify(result.trace))).toEqual(
      JSON.parse(JSON.stringify(result.trace)),
    );
    expect(typeof JSON.stringify(result.trace)).toBe("string");
  });
});
