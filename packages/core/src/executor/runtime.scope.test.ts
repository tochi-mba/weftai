import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineOperation } from "../operation.js";
import { createRegistry } from "../registry.js";
import { ref } from "../schema/ref.js";
import { collection } from "../schema/types.js";
import { createRuntime } from "./runtime.js";

const Node = z.object({ id: z.string(), label: z.string() });
const Nodes = collection("nodes", Node, { label: (n) => n.label, key: (n) => n.id });
const find = defineOperation({
  name: "nodes.find",
  description: "Find.",
  input: z.object({}),
  output: Nodes,
  run: () => [{ id: "1", label: "A" }],
});
const pass = defineOperation({
  name: "nodes.pass",
  description: "Pass.",
  input: z.object({ from: ref(Nodes) }),
  output: Nodes,
  run: ({ input }) => input.from.items,
});
const write = defineOperation({
  name: "nodes.write",
  description: "Write.",
  input: z.object({}),
  output: Nodes,
  effects: "write",
  run: () => [],
});
const registry = createRegistry({ operations: [find, pass, write] });

describe("runtime: include scope", () => {
  it("treats operations outside the scope as unknown, with the scoped list as the hint", async () => {
    const runtime = createRuntime({ registry });
    const result = await runtime.execute(
      { steps: [{ id: "w", op: "nodes.write" }] },
      { ctx: {}, include: (op) => op.effects === "read" },
    );
    expect(result.ok).toBe(false);
    expect(result.issues?.[0]).toMatchObject({
      code: "step.unknown_operation",
      message: "Unknown operation 'nodes.write'.",
      hint: "Available operations: nodes.find, nodes.pass.",
    });
  });

  it("still runs everything inside the scope and stores results normally", async () => {
    const runtime = createRuntime({ registry });
    const result = await runtime.execute(
      {
        steps: [
          { id: "a", op: "nodes.find" },
          { id: "b", op: "nodes.pass", input: { from: "$a" } },
        ],
      },
      { ctx: {}, include: (op) => op.effects === "read" },
    );
    expect(result.ok).toBe(true);
    expect(runtime.store.get("default", "b")?.count).toBe(1);
  });

  it("lets a later call with a wider scope reference results stored by a narrower one", async () => {
    const runtime = createRuntime({ registry });
    await runtime.execute(
      { steps: [{ id: "a", op: "nodes.find" }] },
      { ctx: {}, include: (op) => op.name === "nodes.find" },
    );
    const result = await runtime.execute(
      { steps: [{ id: "b", op: "nodes.pass", input: { from: "$a" } }] },
      { ctx: {} },
    );
    expect(result.ok).toBe(true);
    expect(result.steps[0]?.count).toBe(1);
  });

  it("does not change the runtime's own registry", async () => {
    const runtime = createRuntime({ registry });
    await runtime.execute(
      { steps: [{ id: "a", op: "nodes.find" }] },
      { ctx: {}, include: () => false },
    );
    expect(runtime.registry.names()).toEqual(["nodes.find", "nodes.pass", "nodes.write"]);
  });
});
