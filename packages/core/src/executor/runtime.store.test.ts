import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineOperationFor } from "../operation.js";
import { createRegistry } from "../registry.js";
import type { ResultStore, StoredResult } from "../results/types.js";
import { collection } from "../schema/types.js";
import { createRuntime } from "./runtime.js";

const Node = z.object({ id: z.string(), label: z.string() });
const Nodes = collection("nodes", Node, { label: (n) => n.label, key: (n) => n.id });
type Ctx = Record<string, never>;
const define = defineOperationFor<Ctx>();
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const find = define({
  name: "nodes.find",
  description: "Find.",
  input: z.object({}),
  output: Nodes,
  run: () => [{ id: "1", label: "A" }],
});
const boom = define({
  name: "nodes.boom",
  description: "Fail after a moment.",
  input: z.object({ delayMs: z.number().default(0) }),
  output: Nodes,
  run: async ({ input }) => {
    await sleep(input.delayMs);
    throw new Error("boom");
  },
});
const registry = createRegistry({ operations: [find, boom] });

/** A store that evicts without reporting a cap, as an external store might. */
function capLessStore(): ResultStore {
  const entries = new Map<string, StoredResult>();
  return {
    get: (_session, id) => entries.get(id),
    set(_session, result) {
      const evicted = [...entries.keys()];
      entries.clear();
      entries.set(result.id, result);
      return { replaced: false, evicted, cap: undefined };
    },
    list: () => [...entries.values()],
    delete: (_session, id) => entries.delete(id),
    clear: () => entries.clear(),
  };
}

describe("runtime with a custom store", () => {
  it("words the eviction notice without a cap when the store reports none", async () => {
    const runtime = createRuntime({ registry, store: capLessStore() });
    await runtime.execute({ steps: [{ id: "a", op: "nodes.find" }] }, { ctx: {} });
    const result = await runtime.execute({ steps: [{ id: "b", op: "nodes.find" }] }, { ctx: {} });
    expect(result.steps[0]?.notices).toEqual([
      "Dropped stored result 'a' (oldest in this session) to stay within the session's result cap.",
    ]);
    expect(result.text).toContain("Dropped stored result 'a'");
  });
});

describe("runtime abort policy with several failures", () => {
  it("keeps the first failure as the abort reason when a second step also fails", async () => {
    const runtime = createRuntime({ registry, failure: "abort", limits: { maxParallel: 2 } });
    const result = await runtime.execute(
      {
        steps: [
          { id: "first", op: "nodes.boom" },
          { id: "second", op: "nodes.boom", input: { delayMs: 20 } },
          { id: "third", op: "nodes.find" },
        ],
      },
      { ctx: {} },
    );
    expect(result.steps.map((s) => s.status)).toEqual(["error", "error", "skipped"]);
    expect(result.steps[2]?.skippedBecause).toBe("Skipped because the plan was cancelled.");
  });
});
