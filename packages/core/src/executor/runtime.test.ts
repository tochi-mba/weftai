import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineOperationFor } from "../operation.js";
import { createRegistry } from "../registry.js";
import { createMemoryStore } from "../results/store.js";
import type { ResultStore } from "../results/types.js";
import { DEFAULT_SESSION_ID } from "../results/types.js";
import { ref } from "../schema/ref.js";
import { collection, groups, value, withSources } from "../schema/types.js";
import {
  createRuntime,
  type FailurePolicy,
  type RuntimeHooks,
  type RuntimeLimits,
} from "./runtime.js";

const Node = z.object({ id: z.string(), label: z.string() });
type Node = z.infer<typeof Node>;
const Nodes = collection("nodes", Node, { label: (n) => n.label, key: (n) => n.id });

const nodes: Node[] = [
  { id: "1", label: "Acme" },
  { id: "2", label: "Sub" },
  { id: "3", label: "Other" },
];

type Ctx = { readonly nodes: readonly Node[] };

function runtime(
  extras: {
    store?: ResultStore;
    hooks?: RuntimeHooks<Ctx>;
    limits?: RuntimeLimits;
    failure?: FailurePolicy;
    runFind?: (args: {
      input: { label?: string | undefined };
      ctx: Ctx;
    }) => Node[] | Promise<Node[]>;
  } = {},
) {
  const define = defineOperationFor<Ctx>();
  const find = define({
    name: "nodes.find",
    description: "Find nodes.",
    input: z.object({ label: z.string().optional() }),
    output: Nodes,
    run: ({ input, ctx }) =>
      extras.runFind?.({ input, ctx }) ??
      ctx.nodes.filter((n) => input.label === undefined || n.label === input.label),
  });
  const descendants = define({
    name: "nodes.descendants",
    description: "Walk down.",
    input: z.object({ from: ref(Nodes) }),
    output: Nodes,
    run: ({ input }) => input.from.items.filter((n) => n.label !== "Acme"),
  });
  const count = define({
    name: "nodes.count",
    description: "Count.",
    input: z.object({ from: ref(Nodes) }),
    output: value(z.number()),
    sources: Nodes,
    run: ({ input, notice }) => {
      notice(`Counted ${input.from.count} node(s).`);
      return withSources(input.from.count, Nodes, input.from.items);
    },
  });
  const countBy = define({
    name: "nodes.countBy",
    description: "Group.",
    input: z.object({ from: ref(Nodes) }),
    output: groups(),
    run: ({ input }) => [{ key: "all", count: input.from.count }],
  });
  return createRuntime({
    registry: createRegistry({ operations: [find, descendants, count, countBy] }),
    store: extras?.store,
    hooks: extras?.hooks,
    limits: extras?.limits,
    failure: extras?.failure,
  });
}

const ctx = { nodes };

describe("createRuntime: execution", () => {
  it("runs a single step, stores the result and records a trace", async () => {
    const rt = runtime();
    const result = await rt.execute(
      { steps: [{ id: "acme", op: "nodes.find", input: { label: "Acme" } }] },
      { ctx },
    );
    expect(result.ok).toBe(true);
    expect(result.issues).toBeUndefined();
    expect(result.steps).toHaveLength(1);
    const [step] = result.steps;
    expect(step).toMatchObject({
      id: "acme",
      operation: "nodes.find",
      status: "ok",
      kind: "collection",
      type: "nodes",
      count: 1,
      present: "full",
      referenced: false,
      replaced: false,
      error: undefined,
    });
    expect(step?.items).toEqual([{ id: "1", label: "Acme" }]);
    expect(rt.store.get(DEFAULT_SESSION_ID, "acme")?.count).toBe(1);
    expect(result.trace.ok).toBe(true);
    expect(result.trace.version).toBe(1);
    expect(result.trace.steps[0]?.output).toEqual({ kind: "collection", type: "nodes", count: 1 });
    expect(result.trace.steps[0]?.input).toEqual({ label: "Acme" });
  });

  it("resolves chained references into collections the handler sees", async () => {
    const rt = runtime();
    const result = await rt.execute(
      {
        steps: [
          { id: "acme", op: "nodes.find", input: { label: "Acme" } },
          { id: "owned", op: "nodes.descendants", input: { from: "$acme" } },
        ],
      },
      { ctx },
    );
    expect(result.ok).toBe(true);
    expect(result.steps.map((s) => [s.id, s.count, s.present, s.referenced])).toEqual([
      ["acme", 1, "preview", true],
      ["owned", 0, "full", false],
    ]);
    expect(result.trace.steps[1]?.input).toEqual({ from: { ref: "$acme", count: 1 } });
    expect(result.trace.steps[1]?.dependencies).toEqual(["acme"]);
  });

  it("picks ordinals from the full stored set", async () => {
    const rt = runtime();
    const result = await rt.execute(
      {
        steps: [
          { id: "all", op: "nodes.find" },
          { id: "one", op: "nodes.descendants", input: { from: "$all[2]" } },
        ],
      },
      { ctx },
    );
    expect(result.steps[1]?.items).toEqual([{ id: "2", label: "Sub" }]);
  });

  it("lets a later call reference a stored result by name", async () => {
    const store = createMemoryStore();
    const rt = runtime({ store });
    await rt.execute(
      { steps: [{ id: "all", op: "nodes.find" }] },
      { ctx, session: { id: "chat-1" } },
    );
    const result = await rt.execute(
      { steps: [{ id: "n", op: "nodes.count", input: { from: "$all" } }] },
      { ctx, session: { id: "chat-1" } },
    );
    expect(result.ok).toBe(true);
    expect(result.steps[0]).toMatchObject({ kind: "value", data: 3, count: 3, type: "nodes" });
    expect(result.steps[0]?.notices).toContain("Counted 3 node(s).");
    expect(result.plan?.steps[0]?.refs[0]?.source).toBe("session");
  });

  it("runs independent steps together", async () => {
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const rt = runtime({
      limits: { maxParallel: 4 },
      runFind: async ({ input, ctx }) => {
        started += 1;
        if (started === 2) release();
        await gate;
        return ctx.nodes.filter((n) => input.label === undefined || n.label === input.label);
      },
    });
    const result = await rt.execute(
      {
        steps: [
          { id: "a", op: "nodes.find", input: { label: "Acme" } },
          { id: "b", op: "nodes.find", input: { label: "Sub" } },
        ],
      },
      { ctx },
    );
    expect(result.ok).toBe(true);
    expect(result.steps.map((s) => s.count)).toEqual([1, 1]);
  });

  it("returns grouped counts", async () => {
    const rt = runtime();
    const result = await rt.execute(
      {
        steps: [
          { id: "all", op: "nodes.find" },
          { id: "by", op: "nodes.countBy", input: { from: "$all" } },
        ],
      },
      { ctx },
    );
    expect(result.steps[1]).toMatchObject({
      kind: "groups",
      data: [{ key: "all", count: 3 }],
      status: "ok",
    });
  });

  it("honours a per-step present override", async () => {
    const rt = runtime();
    const result = await rt.execute(
      {
        steps: [
          { id: "acme", op: "nodes.find", input: { label: "Acme" }, present: "full" },
          { id: "owned", op: "nodes.descendants", input: { from: "$acme" }, present: "preview" },
        ],
      },
      { ctx },
    );
    expect(result.steps.map((s) => s.present)).toEqual(["full", "preview"]);
  });

  it("does not execute an invalid plan and reports every issue", async () => {
    const rt = runtime();
    const result = await rt.execute({ steps: [{ id: "a", op: "nodes.fnd" }] }, { ctx });
    expect(result.ok).toBe(false);
    expect(result.steps).toEqual([]);
    expect(result.issues?.[0]?.code).toBe("step.unknown_operation");
    expect(result.trace.issues?.[0]?.hint).toBe("Did you mean 'nodes.find'?");
    expect(rt.store.list(DEFAULT_SESSION_ID)).toEqual([]);
  });

  it("applies maxSteps from runtime limits", async () => {
    const rt = runtime({ limits: { maxSteps: 1 } });
    const result = await rt.execute(
      {
        steps: [
          { id: "a", op: "nodes.find" },
          { id: "b", op: "nodes.find" },
        ],
      },
      { ctx },
    );
    expect(result.issues?.[0]?.code).toBe("plan.too_many_steps");
  });
});
