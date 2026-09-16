import { describe, expect, it } from "vitest";
import { z } from "zod";
import { StepExecutionError } from "../errors.js";
import { defineOperation } from "../operation.js";
import { collection, groups, value, withSources } from "../schema/types.js";
import { normalizeOutput } from "./normalize.js";

const Node = z.object({ id: z.string(), label: z.string() });
const Nodes = collection("nodes", Node, { label: (n) => n.label });
const items = [
  { id: "1", label: "A" },
  { id: "2", label: "B" },
];

const find = defineOperation({
  name: "nodes.find",
  description: "Find.",
  input: z.object({}),
  output: Nodes,
  run: () => items,
});
const count = defineOperation({
  name: "nodes.count",
  description: "Count.",
  input: z.object({}),
  output: value(z.number()),
  sources: Nodes,
  run: () => 2,
});
const by = defineOperation({
  name: "nodes.countBy",
  description: "Group.",
  input: z.object({}),
  output: groups(),
  run: () => [{ key: "A", count: 1 }],
});

describe("normalizeOutput", () => {
  it("freezes a collection handler's array", () => {
    const out = normalizeOutput(find, items, "a");
    expect(out).toMatchObject({ kind: "collection", type: "nodes", count: 2 });
    expect(Object.isFrozen(out.items)).toBe(true);
    expect(out.data).toBe(out.items);
  });

  it("copies the array so the handler cannot mutate the stored result", () => {
    const live = [...items];
    const out = normalizeOutput(find, live, "a");
    live.push({ id: "3", label: "C" });
    expect(out.count).toBe(2);
  });

  it("rejects a non-array from a collection handler", () => {
    expect(() => normalizeOutput(find, { id: "1" }, "a")).toThrow(StepExecutionError);
    expect(() => normalizeOutput(find, { id: "1" }, "a")).toThrow(
      /must return an array of nodes, not object/,
    );
    expect(() => normalizeOutput(find, null, "a")).toThrow(/not null/);
  });

  it("keeps a scalar value and attaches provenance from withSources", () => {
    const out = normalizeOutput(count, withSources(2, Nodes, items), "n");
    expect(out).toMatchObject({ kind: "value", type: "nodes", data: 2, count: 2 });
    expect(out.items).toEqual(items);
  });

  it("falls back to the operation's sources type when withSources is omitted", () => {
    const out = normalizeOutput(count, 2, "n");
    expect(out).toMatchObject({
      kind: "value",
      type: "nodes",
      data: 2,
      items: undefined,
      count: undefined,
    });
  });

  it("normalises grouped counts", () => {
    const rows = [{ key: "A", count: 1 }];
    const out = normalizeOutput(by, rows, "g");
    expect(out).toMatchObject({ kind: "groups", data: rows, type: undefined });
    expect(() => normalizeOutput(by, "nope", "g")).toThrow(/array of groups, not string/);
  });
});
