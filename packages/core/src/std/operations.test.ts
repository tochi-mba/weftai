import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createRuntime } from "../executor/runtime.js";
import { defineOperationFor } from "../operation.js";
import { createRegistry } from "../registry.js";
import { collection } from "../schema/types.js";
import { STANDARD_OP_KINDS, standardOperations } from "./operations.js";

const Node = z.object({
  id: z.string(),
  label: z.string(),
  jurisdiction: z.string().optional(),
  size: z.number().optional(),
});
type Node = z.infer<typeof Node>;
const Nodes = collection("nodes", Node, {
  label: (n) => n.label,
  key: (n) => n.id,
  fields: () => [
    { name: "label", aliases: ["name"], get: (n: Node) => n.label },
    { name: "Jurisdiction", get: (n: Node) => n.jurisdiction },
    { name: "size", get: (n: Node) => n.size },
  ],
});
const Bare = collection("bare", z.object({ label: z.string() }), { label: (b) => b.label });

const nodes: Node[] = [
  { id: "1", label: "Corporate 1", jurisdiction: "UK", size: 10 },
  { id: "2", label: "Sub 2 Ltd", jurisdiction: "Delaware", size: 5 },
  { id: "3", label: "Sub 3 Ltd", jurisdiction: "Delaware" },
  { id: "4", label: "Trust A" },
];

type Ctx = { nodes: Node[] };
const define = defineOperationFor<Ctx>();
const find = define({
  name: "nodes.find",
  description: "Find.",
  input: z.object({}),
  output: Nodes,
  run: ({ ctx }) => ctx.nodes,
});
const bareFind = define({
  name: "bare.find",
  description: "Find bare.",
  input: z.object({}),
  output: Bare,
  run: () => [{ label: "x" }],
});

function runtime(maxItems?: number) {
  return createRuntime({
    registry: createRegistry({
      operations: [
        find,
        bareFind,
        ...standardOperations(Nodes, maxItems === undefined ? {} : { maxItems }),
        ...standardOperations(Bare, { include: ["filter", "countBy"] }),
      ],
    }),
  });
}

async function run(steps: Record<string, unknown>[], maxItems?: number) {
  return runtime(maxItems).execute({ steps }, { ctx: { nodes } });
}

const stepOf = (result: Awaited<ReturnType<typeof run>>, id: string) =>
  result.steps.find((s) => s.id === id);

describe("standardOperations: definition", () => {
  it("names every derived operation after the collection, in a stable order", () => {
    expect(standardOperations(Nodes).map((op) => op.name)).toEqual(
      STANDARD_OP_KINDS.map((kind) => `nodes.${kind}`),
    );
  });

  it("includes only the requested kinds", () => {
    expect(standardOperations(Nodes, { include: ["count"] }).map((op) => op.name)).toEqual([
      "nodes.count",
    ]);
    expect(standardOperations(Nodes, { include: [] })).toEqual([]);
  });

  it("marks every derived operation read-only with a description and a $ref input", () => {
    for (const op of standardOperations(Nodes)) {
      expect(op.effects).toBe("read");
      expect(op.description.length).toBeGreaterThan(10);
      expect(Object.keys((op.input as z.ZodObject).shape)).toContain("from");
    }
  });

  it("declares provenance on count, countBy and mostCommon so references still resolve", () => {
    const byName = new Map(standardOperations(Nodes).map((op) => [op.name, op]));
    expect(byName.get("nodes.count")?.sources).toBe(Nodes);
    expect(byName.get("nodes.countBy")?.sources).toBe(Nodes);
    expect(byName.get("nodes.mostCommon")?.sources).toBe(Nodes);
    expect(byName.get("nodes.filter")?.sources).toBeUndefined();
  });
});

describe("nodes.filter", () => {
  it("keeps items matching every filter and defaults op to eq", async () => {
    const result = await run([
      { id: "all", op: "nodes.find" },
      {
        id: "delaware",
        op: "nodes.filter",
        input: { from: "$all", filters: [{ field: "Jurisdiction", value: "Delaware" }] },
      },
    ]);
    expect(result.text).toContain("delaware (nodes): 2 matched");
    expect(stepOf(result, "delaware")?.items).toEqual([nodes[1], nodes[2]]);
  });

  it("ANDs several filters", async () => {
    const result = await run([
      { id: "all", op: "nodes.find" },
      {
        id: "x",
        op: "nodes.filter",
        input: {
          from: "$all",
          filters: [
            { field: "Jurisdiction", value: "Delaware" },
            { field: "size", op: "gte", value: 5 },
          ],
        },
      },
    ]);
    expect(stepOf(result, "x")?.items).toEqual([nodes[1]]);
  });

  it("resolves aliases", async () => {
    const result = await run([
      { id: "all", op: "nodes.find" },
      {
        id: "named",
        op: "nodes.filter",
        input: { from: "$all", filters: [{ field: "name", value: "Corporate 1" }] },
      },
    ]);
    expect(stepOf(result, "named")?.count).toBe(1);
  });

  it("passes everything through with no filters", async () => {
    const result = await run([
      { id: "all", op: "nodes.find" },
      { id: "same", op: "nodes.filter", input: { from: "$all" } },
    ]);
    expect(stepOf(result, "same")?.count).toBe(4);
  });

  it("errors on an unknown field, listing the available ones", async () => {
    const result = await run([
      { id: "all", op: "nodes.find" },
      {
        id: "wrong",
        op: "nodes.filter",
        input: { from: "$all", filters: [{ field: "relationshipType", value: "Ownership" }] },
      },
    ]);
    expect(result.ok).toBe(false);
    expect(stepOf(result, "wrong")?.error).toBe(
      "Unknown field 'relationshipType' on nodes. Available fields: label, Jurisdiction, size.",
    );
    expect(result.text).toContain("wrong: failed");
  });

  it("suggests a near-miss field", async () => {
    const result = await run([
      { id: "all", op: "nodes.find" },
      {
        id: "wrong",
        op: "nodes.filter",
        input: { from: "$all", filters: [{ field: "jurisdicton", value: "x" }] },
      },
    ]);
    expect(stepOf(result, "wrong")?.error).toContain("Did you mean 'Jurisdiction'?");
  });

  it("errors on a collection with no fields", async () => {
    const result = await run([
      { id: "b", op: "bare.find" },
      {
        id: "f",
        op: "bare.filter",
        input: { from: "$b", filters: [{ field: "label", value: "x" }] },
      },
    ]);
    expect(stepOf(result, "f")?.error).toBe(
      "bare has no fields. This collection cannot be filtered, grouped or detailed.",
    );
  });

  it("hard-caps results instead of truncating silently", async () => {
    const result = await run(
      [
        { id: "all", op: "nodes.find" },
        { id: "kept", op: "nodes.filter", input: { from: "$all", filters: [] } },
      ],
      2,
    );
    expect(stepOf(result, "kept")?.status).toBe("error");
    expect(stepOf(result, "kept")?.error).toBe(
      "nodes.filter matched 4 nodes; at most 2 are allowed. Narrow the query.",
    );
  });
});

describe("nodes.count, countBy, mostCommon", () => {
  it("counts and keeps the counted items as provenance", async () => {
    const result = await run([
      { id: "all", op: "nodes.find" },
      { id: "n", op: "nodes.count", input: { from: "$all" } },
      { id: "again", op: "nodes.filter", input: { from: "$n" } },
    ]);
    expect(stepOf(result, "n")?.data).toBe(4);
    expect(result.text).toContain("n (nodes): 4 matched\n  4");
    expect(stepOf(result, "again")?.count).toBe(4);
  });

  it("groups most common first, ties by key, and reports missing values last", async () => {
    const result = await run([
      { id: "all", op: "nodes.find" },
      { id: "by", op: "nodes.countBy", input: { from: "$all", field: "Jurisdiction" } },
    ]);
    expect(stepOf(result, "by")?.data).toEqual([
      { key: "Delaware", count: 2 },
      { key: "UK", count: 1 },
      { key: "not recorded", count: 1 },
    ]);
    expect(result.text).toContain(
      "by (nodes): 4 matched\n  Delaware: 2\n  UK: 1\n  not recorded: 1",
    );
  });

  it("groups an empty set into no groups", async () => {
    const result = await run([
      { id: "all", op: "nodes.find" },
      {
        id: "none",
        op: "nodes.filter",
        input: { from: "$all", filters: [{ field: "label", value: "zzz" }] },
      },
      { id: "by", op: "nodes.countBy", input: { from: "$none", field: "Jurisdiction" } },
    ]);
    expect(stepOf(result, "by")?.data).toEqual([]);
    expect(result.text).toContain("by (nodes): 0 matched");
  });

  it("returns the single most common value by default and more with a limit", async () => {
    const one = await run([
      { id: "all", op: "nodes.find" },
      { id: "top", op: "nodes.mostCommon", input: { from: "$all", field: "Jurisdiction" } },
    ]);
    expect(stepOf(one, "top")?.data).toEqual([{ key: "Delaware", count: 2 }]);
    const two = await run([
      { id: "all", op: "nodes.find" },
      {
        id: "top",
        op: "nodes.mostCommon",
        input: { from: "$all", field: "Jurisdiction", limit: 2 },
      },
    ]);
    expect(stepOf(two, "top")?.data).toEqual([
      { key: "Delaware", count: 2 },
      { key: "UK", count: 1 },
    ]);
  });

  it("errors on an unknown group field", async () => {
    const result = await run([
      { id: "all", op: "nodes.find" },
      { id: "by", op: "nodes.countBy", input: { from: "$all", field: "nope" } },
    ]);
    expect(stepOf(result, "by")?.error).toContain("Unknown field 'nope' on nodes.");
  });
});

describe("nodes.distinct, first, pick", () => {
  it("keeps the first item per distinct value and says how many", async () => {
    const result = await run([
      { id: "all", op: "nodes.find" },
      { id: "uniq", op: "nodes.distinct", input: { from: "$all", field: "Jurisdiction" } },
    ]);
    expect(stepOf(result, "uniq")?.items).toEqual([nodes[0], nodes[1], nodes[3]]);
    expect(result.text).toContain("  3 distinct Jurisdiction value(s) from 4.");
  });

  it("takes the first item, or nothing from an empty set", async () => {
    const result = await run([
      { id: "all", op: "nodes.find" },
      { id: "first", op: "nodes.first", input: { from: "$all" } },
      {
        id: "none",
        op: "nodes.filter",
        input: { from: "$all", filters: [{ field: "label", value: "zzz" }] },
      },
      { id: "nothing", op: "nodes.first", input: { from: "$none" } },
    ]);
    expect(stepOf(result, "first")?.items).toEqual([nodes[0]]);
    expect(stepOf(result, "nothing")?.items).toEqual([]);
  });

  it("picks by 1-based positions in the order given", async () => {
    const result = await run([
      { id: "all", op: "nodes.find" },
      { id: "picked", op: "nodes.pick", input: { from: "$all", ordinals: [3, 1] } },
    ]);
    expect(stepOf(result, "picked")?.items).toEqual([nodes[2], nodes[0]]);
  });

  it("rejects an out-of-range position with the valid range", async () => {
    const result = await run([
      { id: "all", op: "nodes.find" },
      { id: "picked", op: "nodes.pick", input: { from: "$all", ordinals: [9] } },
    ]);
    expect(stepOf(result, "picked")?.error).toBe(
      "'9' is out of range; 'nodes' holds 4 item(s). Use a position between 1 and 4.",
    );
  });

  it("rejects position zero at validation time", async () => {
    const result = await run([
      { id: "all", op: "nodes.find" },
      { id: "picked", op: "nodes.pick", input: { from: "$all", ordinals: [0] } },
    ]);
    expect(result.issues?.[0]?.code).toBe("step.invalid_input");
  });
});

describe("nodes.details", () => {
  it("shows every field when none are named, without repeating the label", async () => {
    const result = await run([
      { id: "all", op: "nodes.find" },
      { id: "info", op: "nodes.details", input: { from: "$all" } },
    ]);
    expect(stepOf(result, "info")?.fields).toBe("all");
    expect(result.text).toContain("  1. Corporate 1 - Jurisdiction: UK; size: 10");
    expect(result.text).toContain("  4. Trust A - Jurisdiction: not recorded; size: not recorded");
  });

  it("shows only the named fields", async () => {
    const result = await run([
      { id: "all", op: "nodes.find" },
      { id: "info", op: "nodes.details", input: { from: "$all", fields: ["Jurisdiction"] } },
    ]);
    expect(stepOf(result, "info")?.fields).toEqual(["Jurisdiction"]);
    expect(result.text).toContain("  3. Sub 3 Ltd - Jurisdiction: Delaware");
    expect(result.text).not.toContain("size:");
  });

  it("fails closed on an unknown field", async () => {
    const result = await run([
      { id: "all", op: "nodes.find" },
      { id: "show", op: "nodes.details", input: { from: "$all", fields: ["nope"] } },
    ]);
    expect(stepOf(result, "show")?.error).toContain("Unknown field 'nope' on nodes.");
  });

  it("rejects an empty field list at validation time", async () => {
    const result = await run([
      { id: "all", op: "nodes.find" },
      { id: "show", op: "nodes.details", input: { from: "$all", fields: [] } },
    ]);
    expect(result.issues?.[0]?.code).toBe("step.invalid_input");
  });
});
