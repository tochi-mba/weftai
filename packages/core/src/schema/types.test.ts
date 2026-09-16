import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { DefinitionError } from "../errors.js";
import {
  type Collection,
  type CollectionType,
  collection,
  type Group,
  groups,
  isStepOutput,
  makeCollection,
  type OutputData,
  value,
  withSources,
} from "./types.js";

const Node = z.object({ id: z.string(), label: z.string() });
type Node = z.infer<typeof Node>;
type Ctx = { readonly fieldNames: readonly string[] };

describe("collection", () => {
  it("accepts short lowerCamelCase plural names", () => {
    for (const name of ["nodes", "nodes2", "nodeList", "a", "contractsV2"]) {
      expect(collection(name, Node, { label: (n) => n.label }).name, name).toBe(name);
    }
  });

  it("rejects other names with a DefinitionError that shows the rule", () => {
    for (const name of [
      "Nodes",
      "",
      "node-s",
      "node s",
      "2nodes",
      "nodes_list",
      "nödes",
      "nodes.list",
    ]) {
      expect(() => collection(name, Node, { label: (n) => n.label }), name).toThrow(
        DefinitionError,
      );
      expect(() => collection(name, Node, { label: (n) => n.label }), name).toThrow(
        `Collection name '${name}' is invalid; use a short lowerCamelCase plural such as 'nodes'.`,
      );
    }
  });

  it("records kind, item schema and description", () => {
    const type = collection("nodes", Node, {
      label: (n) => n.label,
      description: "Catalog parts.",
    });
    expect(type.kind).toBe("collection");
    expect(type.item).toBe(Node);
    expect(type.description).toBe("Catalog parts.");
    expect(collection("nodes", Node, { label: (n) => n.label }).description).toBeUndefined();
  });

  it("uses the given label and key functions", () => {
    const type = collection("nodes", Node, { label: (n) => n.label, key: (n) => n.id });
    expect(type.label({ id: "1", label: "A" })).toBe("A");
    expect(type.key({ id: "1", label: "A" })).toBe("1");
  });

  it("defaults key to label", () => {
    const type = collection("nodes", Node, { label: (n) => `label:${n.label}` });
    expect(type.key({ id: "1", label: "A" })).toBe("label:A");
  });

  it("omits the fields property entirely when none are given", () => {
    const type = collection("nodes", Node, { label: (n) => n.label });
    expect("fields" in type).toBe(false);
  });

  it("passes the context to the fields catalogue", () => {
    const type = collection<Node, Ctx>("nodes", Node, {
      label: (n) => n.label,
      fields: (ctx) => ctx.fieldNames.map((name) => ({ name, get: () => name })),
    });
    const fields = type.fields?.({ fieldNames: ["label", "Jurisdiction"] }) ?? [];
    expect(fields.map((f) => f.name)).toEqual(["label", "Jurisdiction"]);
    expect(fields[0]?.get({ id: "1", label: "A" })).toBe("label");
  });

  it("is assignable to the untyped collection type because methods are bivariant", () => {
    const typed = collection<Node, Ctx>("nodes", Node, { label: (n) => n.label });
    const untyped: CollectionType<unknown, unknown> = typed;
    expect(untyped.name).toBe("nodes");
  });
});

describe("makeCollection", () => {
  const Nodes = collection("nodes", Node, { label: (n) => n.label });

  it("materialises from a collection type", () => {
    const made = makeCollection(Nodes, [{ id: "1", label: "A" }]);
    expect(made).toEqual({ type: "nodes", items: [{ id: "1", label: "A" }], count: 1 });
  });

  it("materialises from a type name", () => {
    expect(makeCollection("edges", [])).toEqual({ type: "edges", items: [], count: 0 });
  });

  it("copies and freezes the items so later mutation of the source is invisible", () => {
    const source = [{ id: "1", label: "A" }];
    const made = makeCollection(Nodes, source);
    source.push({ id: "2", label: "B" });
    expect(made.count).toBe(1);
    expect(made.items).toHaveLength(1);
    expect(Object.isFrozen(made.items)).toBe(true);
    expect(() => (made.items as Node[]).push({ id: "3", label: "C" })).toThrow();
  });

  it("types the items", () => {
    const made = makeCollection(Nodes, []);
    expectTypeOf(made).toEqualTypeOf<Collection<Node>>();
  });
});

describe("value", () => {
  it("wraps a schema with an optional description", () => {
    const schema = z.number();
    expect(value(schema)).toEqual({ kind: "value", schema, description: undefined });
    expect(value(schema, { description: "A count." }).description).toBe("A count.");
  });
});

describe("groups", () => {
  it("has a kind and an optional description", () => {
    expect(groups()).toEqual({ kind: "groups", description: undefined });
    expect(groups({ description: "By jurisdiction." }).description).toBe("By jurisdiction.");
  });
});

describe("withSources and isStepOutput", () => {
  const Nodes = collection("nodes", Node, { label: (n) => n.label });

  it("attaches a materialised provenance collection to a value", () => {
    const out = withSources(3, Nodes, [{ id: "1", label: "A" }]);
    expect(out.data).toBe(3);
    expect(out.sources).toEqual({ type: "nodes", items: [{ id: "1", label: "A" }], count: 1 });
    expect(Object.isFrozen(out.sources?.items)).toBe(true);
  });

  it("allows empty provenance", () => {
    expect(withSources("none", Nodes, []).sources?.count).toBe(0);
  });

  it("recognises step outputs and nothing else", () => {
    expect(isStepOutput(withSources(1, Nodes, []))).toBe(true);
    for (const notOutput of [
      null,
      undefined,
      1,
      "x",
      true,
      [],
      {},
      { data: 1 },
      { data: 1, sources: {} },
    ]) {
      expect(isStepOutput(notOutput), JSON.stringify(notOutput)).toBe(false);
    }
  });

  it("uses a global symbol so outputs from another copy of the package still count", () => {
    const foreign = { [Symbol.for("weftai.stepOutput")]: true, data: 1, sources: undefined };
    expect(isStepOutput(foreign)).toBe(true);
  });

  it("serialises to plain JSON without the marker", () => {
    expect(JSON.parse(JSON.stringify(withSources(2, Nodes, [])))).toEqual({
      data: 2,
      sources: { type: "nodes", items: [], count: 0 },
    });
  });
});

describe("OutputData", () => {
  it("maps each result type to what a handler returns", () => {
    const Nodes = collection("nodes", Node, { label: (n) => n.label });
    expectTypeOf<OutputData<typeof Nodes>>().toEqualTypeOf<readonly Node[]>();
    expectTypeOf<OutputData<ReturnType<typeof value<number>>>>().toEqualTypeOf<number>();
    expectTypeOf<OutputData<ReturnType<typeof groups>>>().toEqualTypeOf<readonly Group[]>();
  });
});
