import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineOperation } from "./operation.js";
import { createRegistry } from "./registry.js";
import { ref } from "./schema/ref.js";
import { collection, groups, value, withSources } from "./schema/types.js";

const Node = z.object({ id: z.string(), label: z.string() });
const Nodes = collection("nodes", Node, { label: (n) => n.label });
const Edge = z.object({ from: z.string(), to: z.string() });
const Edges = collection("edges", Edge, { label: (e) => `${e.from} to ${e.to}` });

const find = defineOperation({
  name: "nodes.find",
  description: "Find nodes.",
  input: z.object({ label: z.string().optional() }),
  output: Nodes,
  examples: [{ input: { label: "Acme" } }],
  run: () => [],
});
const count = defineOperation({
  name: "nodes.count",
  description: "Count nodes.",
  input: z.object({ from: ref(Nodes) }),
  output: value(z.number()),
  sources: Nodes,
  run: ({ input }) => withSources(input.from.count, Nodes, input.from.items),
});
const link = defineOperation({
  name: "edges.link",
  description: "Create an edge.",
  input: z.object({ from: ref(Nodes), to: ref(Nodes) }),
  output: Edges,
  effects: "write",
  run: () => [],
});

describe("createRegistry", () => {
  const registry = createRegistry({ operations: [find, count, link] });

  it("indexes operations by name", () => {
    expect(registry.names()).toEqual(["nodes.find", "nodes.count", "edges.link"]);
    expect(registry.get("nodes.find")).toBe(find);
    expect(registry.has("nodes.nope")).toBe(false);
  });

  it("rejects duplicates", () => {
    expect(() => createRegistry({ operations: [find, find] })).toThrow(/registered twice/);
  });

  it("suggests the nearest name when an operation is unknown", () => {
    expect(registry.suggest("nodes.fnd")).toBe("nodes.find");
    expect(() => registry.require("nodes.fnd")).toThrow(/Did you mean 'nodes.find'/);
    expect(() => registry.require("zzz")).toThrow(/^Unknown operation 'zzz'.$/);
  });

  it("lists the distinct collection types operations produce", () => {
    expect(registry.collections().map((c) => c.name)).toEqual(["nodes", "edges"]);
  });

  it("filters into a smaller registry", () => {
    const reads = registry.filter((op) => op.effects === "read");
    expect(reads.names()).toEqual(["nodes.find", "nodes.count"]);
  });

  it("describes operations for the model", () => {
    const text = registry.describe();
    expect(text).toContain("- nodes.find — Find nodes.");
    expect(text).toContain("  input: { label?: string }");
    expect(text).toContain("  returns: nodes");
    expect(text).toContain('  e.g. {"label":"Acme"}');
    expect(text).toContain(
      "  returns: number (references resolve to the nodes it was computed from)",
    );
    expect(text).toContain("$stepId[1,3]");
    expect(registry.describe({ intro: false, examples: false })).not.toContain("e.g.");
  });

  it("describes grouped counts and allows an empty registry", () => {
    const grouped = defineOperation({
      name: "nodes.countBy",
      description: "Group nodes.",
      input: z.object({ from: ref(Nodes) }),
      output: groups(),
      sources: Nodes,
      run: () => [],
    });
    const withGroups = createRegistry({ operations: [grouped] });
    expect(withGroups.describe({ intro: false })).toContain(
      "grouped counts (references resolve to the nodes counted)",
    );
    expect(createRegistry({ operations: [] }).names()).toEqual([]);
    expect(createRegistry({ operations: [] }).describe()).toContain("Operations:");
  });

  it("builds a union plan schema with one variant per operation", () => {
    const schema = registry.planSchema();
    const steps = (schema.properties as { steps: Record<string, unknown> }).steps;
    const variants = (steps.items as { anyOf: Record<string, unknown>[] }).anyOf;
    expect(variants.map((v) => (v.properties as { op: { const: string } }).op.const)).toEqual([
      "nodes.find",
      "nodes.count",
      "edges.link",
    ]);
    expect(variants[0]?.required).toEqual(["id", "op"]);
    expect(steps.minItems).toBe(1);
    expect(schema.required).toEqual(["steps"]);
  });

  it("builds a loose plan schema with op as an enum", () => {
    const schema = registry.planSchema({ style: "loose", strict: true, maxSteps: 10 });
    const steps = (schema.properties as { steps: Record<string, unknown> }).steps;
    const item = steps.items as { properties: { op: { enum: string[] } }; required: string[] };
    expect(item.properties.op.enum).toEqual(["nodes.find", "nodes.count", "edges.link"]);
    expect(item.required).toEqual(["id", "op", "input"]);
    expect(steps.maxItems).toBe(10);
  });
});
