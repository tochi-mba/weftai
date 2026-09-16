import { describe, expect, it } from "vitest";
import { z } from "zod";
import { type Ref, ref } from "./ref.js";
import { collection } from "./types.js";
import { collectRefs, formatPath, getAtPath, setAtPath } from "./walk.js";

const Node = z.object({ id: z.string(), label: z.string() });
const Nodes = collection("nodes", Node, { label: (n) => n.label });
const Edges = collection("edges", z.object({ id: z.string() }), { label: (e) => e.id });

function sitesOf(schema: z.ZodType, raw: unknown) {
  const parsed = schema.parse(raw);
  return collectRefs(schema, parsed).map((site) => ({
    path: formatPath(site.path),
    text: site.text,
    id: site.parsed?.id,
    ordinals: site.parsed?.ordinals,
    error: site.error,
    target: site.meta.target?.name,
  }));
}

describe("collectRefs: where references can appear", () => {
  it("finds a top-level reference when the schema itself is a ref", () => {
    const sites = collectRefs(ref(Nodes), "$a");
    expect(sites).toHaveLength(1);
    expect(sites[0]?.path).toEqual([]);
    expect(sites[0]?.parsed?.id).toBe("a");
  });

  it("finds references in object fields in declaration order", () => {
    const schema = z.object({ b: ref(Nodes), a: ref(Edges) });
    expect(sitesOf(schema, { a: "$x", b: "$y" }).map((s) => [s.path, s.text, s.target])).toEqual([
      ["input.b", "$y", "nodes"],
      ["input.a", "$x", "edges"],
    ]);
  });

  it("finds references in arrays with their index", () => {
    const schema = z.object({ refs: z.array(ref()) });
    expect(sitesOf(schema, { refs: ["$a", "$b[2]"] }).map((s) => [s.path, s.ordinals])).toEqual([
      ["input.refs[0]", undefined],
      ["input.refs[1]", [2]],
    ]);
  });

  it("finds references inside arrays of objects and nested objects", () => {
    const schema = z.object({
      pairs: z.array(z.object({ from: ref(Nodes), to: ref(Nodes) })),
      deep: z.object({ deeper: z.object({ deepest: ref(Nodes) }) }),
    });
    const sites = sitesOf(schema, {
      pairs: [
        { from: "$a", to: "$b" },
        { from: "$c", to: "$d" },
      ],
      deep: { deeper: { deepest: "$e" } },
    });
    expect(sites.map((s) => s.path)).toEqual([
      "input.pairs[0].from",
      "input.pairs[0].to",
      "input.pairs[1].from",
      "input.pairs[1].to",
      "input.deep.deeper.deepest",
    ]);
  });

  it("looks through optional, default, nullable, readonly and catch wrappers", () => {
    const schema = z.object({
      a: ref(Nodes).optional(),
      b: ref(Nodes).default("$dflt" as Ref<{ id: string; label: string }>),
      c: ref(Nodes).nullable(),
      d: ref(Nodes).readonly(),
      e: ref(Nodes).catch("$caught" as Ref<{ id: string; label: string }>),
    });
    const sites = sitesOf(schema, { a: "$a", c: "$c", d: "$d", e: "$e" });
    expect(sites.map((s) => s.text)).toEqual(["$a", "$dflt", "$c", "$d", "$e"]);
  });

  it("skips absent optionals and null values", () => {
    const schema = z.object({ a: ref(Nodes).optional(), c: ref(Nodes).nullable() });
    expect(sitesOf(schema, { c: null })).toEqual([]);
  });

  it("finds references in record values and tuple items", () => {
    const schema = z.object({
      byName: z.record(z.string(), ref(Nodes)),
      pair: z.tuple([ref(Nodes), z.string()]),
    });
    const sites = sitesOf(schema, { byName: { x: "$x", y: "$y" }, pair: ["$p", "plain"] });
    expect(sites.map((s) => s.path)).toEqual(["input.byName.x", "input.byName.y", "input.pair[0]"]);
  });

  it("follows the union member that accepts the value", () => {
    const schema = z.object({
      first: z.union([ref(Nodes), z.literal("all")]),
      second: z.union([z.literal("all"), ref(Nodes)]),
      neither: z.union([ref(Nodes), z.literal("all")]),
    });
    const sites = sitesOf(schema, { first: "$a", second: "$b", neither: "all" });
    expect(sites.map((s) => s.path)).toEqual(["input.first", "input.second"]);
  });

  it("visits both sides of an intersection", () => {
    const schema = z.intersection(z.object({ a: ref(Nodes) }), z.object({ b: ref(Edges) }));
    expect(sitesOf(schema, { a: "$a", b: "$b" }).map((s) => s.path)).toEqual([
      "input.a",
      "input.b",
    ]);
  });

  it("looks through transforms and lazy schemas", () => {
    const transformed = z.object({ a: ref(Nodes) }).transform((v) => v);
    expect(collectRefs(transformed, { a: "$a" })).toHaveLength(1);
    type Tree = { ref: string; children: Tree[] };
    const tree: z.ZodType<Tree> = z.lazy(() =>
      z.object({ ref: ref(Nodes), children: z.array(tree) }),
    ) as unknown as z.ZodType<Tree>;
    const sites = collectRefs(tree, { ref: "$root", children: [{ ref: "$child", children: [] }] });
    expect(sites.map((s) => formatPath(s.path))).toEqual(["input.ref", "input.children[0].ref"]);
  });

  it("stops descending at the depth limit without throwing", () => {
    type Chain = { next?: Chain; here: string };
    const chain: z.ZodType<Chain> = z.lazy(() =>
      z.object({ here: ref(Nodes), next: chain.optional() }),
    ) as unknown as z.ZodType<Chain>;
    let value: Chain = { here: "$leaf" };
    for (let i = 0; i < 60; i++) value = { here: `$n${i}`, next: value };
    const sites = collectRefs(chain, value);
    expect(sites.length).toBeGreaterThan(5);
    expect(sites.length).toBeLessThan(61);
  });
});

describe("collectRefs: what it ignores", () => {
  it("ignores plain strings that happen to start with a dollar sign", () => {
    const schema = z.object({ plain: z.string(), refd: ref(Nodes) });
    expect(sitesOf(schema, { plain: "$notARef", refd: "$yes" }).map((s) => s.path)).toEqual([
      "input.refd",
    ]);
  });

  it("ignores values whose shape does not match the schema", () => {
    const schema = z.object({ a: ref(Nodes) });
    expect(collectRefs(schema, 42)).toEqual([]);
    expect(collectRefs(schema, ["$a"])).toEqual([]);
    expect(collectRefs(z.array(ref(Nodes)), { 0: "$a" })).toEqual([]);
    expect(collectRefs(z.record(z.string(), ref(Nodes)), "x")).toEqual([]);
    expect(collectRefs(ref(Nodes), 7)).toEqual([]);
  });

  it("ignores keys that are not in the object shape", () => {
    const schema = z.object({ a: ref(Nodes) });
    expect(collectRefs(schema, { b: "$b" })).toEqual([]);
  });

  it("records a syntax error instead of a parsed reference for a malformed string", () => {
    const sites = collectRefs(z.object({ a: ref(Nodes) }), { a: "$bad[0]" });
    expect(sites[0]?.parsed).toBeUndefined();
    expect(sites[0]?.error).toContain("positions are 1-based");
    expect(sites[0]?.text).toBe("$bad[0]");
  });
});

describe("setAtPath", () => {
  it("returns the replacement for the empty path", () => {
    expect(setAtPath({ a: 1 }, [], "new")).toBe("new");
  });

  it("replaces nested object and array positions without mutating", () => {
    const root = { a: [{ b: 1 }, { b: 2 }], c: { d: "x" } };
    const next = setAtPath(root, ["a", 1, "b"], 9) as typeof root;
    expect(next.a[1]?.b).toBe(9);
    expect(root.a[1]?.b).toBe(2);
    expect(next.a[0]).toBe(root.a[0]);
    expect(next.c).toBe(root.c);
    const other = setAtPath(root, ["c", "d"], "y") as typeof root;
    expect(other.c.d).toBe("y");
    expect(other.a).toBe(root.a);
  });

  it("adds a missing key on an existing object", () => {
    expect(setAtPath({}, ["a"], 1)).toEqual({ a: 1 });
  });

  it("appends past the end of an array", () => {
    expect(setAtPath([1], [1], 2)).toEqual([1, 2]);
  });

  it("throws when the path runs through a primitive", () => {
    expect(() => setAtPath({ a: 1 }, ["a", "b"], 2)).toThrow(/Cannot set path/);
    expect(() => setAtPath(null, ["a"], 2)).toThrow(/Cannot set path/);
    expect(() => setAtPath({}, ["a", "b"], 2)).toThrow(/Cannot set path/);
  });
});

describe("getAtPath", () => {
  it("reads through objects and arrays", () => {
    const root = { a: [{ b: 1 }], c: "x" };
    expect(getAtPath(root, [])).toBe(root);
    expect(getAtPath(root, ["a", 0, "b"])).toBe(1);
    expect(getAtPath(root, ["c"])).toBe("x");
  });

  it("returns undefined for anything missing or through a primitive", () => {
    const root = { a: [{ b: 1 }] };
    expect(getAtPath(root, ["zzz"])).toBeUndefined();
    expect(getAtPath(root, ["a", 5])).toBeUndefined();
    expect(getAtPath(root, ["a", 0, "b", "c"])).toBeUndefined();
    expect(getAtPath(null, ["a"])).toBeUndefined();
  });
});

describe("formatPath", () => {
  it("renders paths the way a JSON-literate model reads them", () => {
    expect(formatPath([])).toBe("input");
    expect(formatPath(["a"])).toBe("input.a");
    expect(formatPath(["a", 0])).toBe("input.a[0]");
    expect(formatPath([0])).toBe("input[0]");
    expect(formatPath(["a", 0, "b", 1, 2])).toBe("input.a[0].b[1][2]");
    expect(formatPath(["0"])).toBe("input.0");
  });
});
