import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineOperation } from "../operation.js";
import { createRegistry } from "../registry.js";
import { createMemoryStore } from "../results/store.js";
import { collection } from "../schema/types.js";
import { createRuntime } from "./runtime.js";

const Node = z.object({ id: z.string(), label: z.string() });
const Nodes = collection("nodes", Node, { label: (n) => n.label });

const find = defineOperation({
  name: "nodes.find",
  description: "Find.",
  input: z.object({}),
  output: Nodes,
  run: ({ step, notice }) => {
    notice(`ran ${step.id}`);
    return [{ id: step.id, label: step.id }];
  },
});

describe("createRuntime: hooks and store notices", () => {
  it("runs beforeStep, afterStep and onStepError in order", async () => {
    const events: string[] = [];
    const boom = defineOperation({
      name: "nodes.boom",
      description: "Fail.",
      input: z.object({}),
      output: Nodes,
      run: () => {
        throw new Error("nope");
      },
    });
    const rt = createRuntime({
      registry: createRegistry({ operations: [find, boom] }),
      limits: { maxParallel: 1 },
      hooks: {
        beforeStep({ step }) {
          events.push(`before:${step.id}`);
        },
        afterStep({ step, result }) {
          events.push(`after:${step.id}:${result.status}`);
        },
        onStepError({ step }) {
          events.push(`error:${step.id}`);
        },
      },
    });
    await rt.execute(
      {
        steps: [
          { id: "ok", op: "nodes.find" },
          { id: "bad", op: "nodes.boom" },
        ],
      },
      { ctx: {} },
    );
    expect(events).toEqual(["before:ok", "after:ok:ok", "before:bad", "error:bad"]);
  });

  it("turns a beforeStep throw into a step error", async () => {
    const rt = createRuntime({
      registry: createRegistry({ operations: [find] }),
      hooks: {
        beforeStep({ step }) {
          if (step.id === "blocked") throw new Error("not allowed");
        },
      },
    });
    const result = await rt.execute({ steps: [{ id: "blocked", op: "nodes.find" }] }, { ctx: {} });
    expect(result.steps[0]?.status).toBe("error");
    expect(result.steps[0]?.error).toBe(
      "Step 'blocked' failed while running 'nodes.find': not allowed",
    );
  });

  it("does not hide the original error when onStepError throws", async () => {
    const boom = defineOperation({
      name: "nodes.boom",
      description: "Fail.",
      input: z.object({}),
      output: Nodes,
      run: () => {
        throw new Error("root");
      },
    });
    const rt = createRuntime({
      registry: createRegistry({ operations: [boom] }),
      hooks: {
        onStepError() {
          throw new Error("hook");
        },
      },
    });
    const result = await rt.execute({ steps: [{ id: "a", op: "nodes.boom" }] }, { ctx: {} });
    expect(result.steps[0]?.error).toContain("root");
    expect(result.steps[0]?.error).not.toContain("hook");
  });

  it("emits a replacement notice when a step id is reused", async () => {
    const store = createMemoryStore();
    const rt = createRuntime({ registry: createRegistry({ operations: [find] }), store });
    await rt.execute(
      { steps: [{ id: "owned", op: "nodes.find" }] },
      { ctx: {}, session: { id: "s" } },
    );
    const result = await rt.execute(
      { steps: [{ id: "owned", op: "nodes.find" }] },
      { ctx: {}, session: { id: "s" } },
    );
    expect(result.steps[0]?.replaced).toBe(true);
    expect(result.steps[0]?.notices).toEqual([
      "ran owned",
      "Reusing step id 'owned' replaced the previous result.",
    ]);
    expect(store.get("s", "owned")?.notices).toEqual(result.steps[0]?.notices);
  });

  it("emits an eviction notice that names the dropped result and the cap", async () => {
    const store = createMemoryStore({ maxResults: 1 });
    const rt = createRuntime({ registry: createRegistry({ operations: [find] }), store });
    await rt.execute(
      { steps: [{ id: "old", op: "nodes.find" }] },
      { ctx: {}, session: { id: "s" } },
    );
    const result = await rt.execute(
      { steps: [{ id: "new", op: "nodes.find" }] },
      { ctx: {}, session: { id: "s" } },
    );
    expect(result.steps[0]?.notices).toContain(
      "Dropped stored result 'old' (oldest in this session) because the session already holds 1 results.",
    );
    expect(store.get("s", "old")).toBeUndefined();
    expect(store.get("s", "new")?.id).toBe("new");
  });
});
