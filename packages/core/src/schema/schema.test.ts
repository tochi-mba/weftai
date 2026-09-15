import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { REF_PATTERN_SOURCE } from "../refs/syntax.js";
import { inputJsonSchema } from "./json.js";
import { isRefSchema, type Resolved, ref, refMeta } from "./ref.js";
import { summarizeSchema } from "./summarize.js";
import { type Collection, collection, isStepOutput, makeCollection, withSources } from "./types.js";
import { collectRefs, formatPath, getAtPath, setAtPath } from "./walk.js";

const Node = z.object({ id: z.string(), label: z.string(), jurisdiction: z.string().optional() });
type Node = z.infer<typeof Node>;
const Nodes = collection("nodes", Node, { label: (n) => n.label, key: (n) => n.id });

describe("collection", () => {
  it("rejects names that are not lowerCamelCase", () => {
    expect(() => collection("Nodes", Node, { label: (n) => n.label })).toThrow(/invalid/);
  });

  it("defaults key to label", () => {
    expect(Nodes.key({ id: "1", label: "A" })).toBe("1");
    const things = collection("things", Node, { label: (n) => n.label });
    expect(things.key({ id: "1", label: "A" })).toBe("A");
  });

  it("freezes items when materialised", () => {
    const made = makeCollection(Nodes, [{ id: "1", label: "A" }]);
    expect(made).toMatchObject({ type: "nodes", count: 1 });
    expect(Object.isFrozen(made.items)).toBe(true);
  });
});

describe("ref", () => {
  it("is a string in the model-facing contract and carries its target privately", () => {
    const schema = ref(Nodes);
    expect(isRefSchema(schema)).toBe(true);
    expect(refMeta(schema)?.target).toBe(Nodes);
    expect(schema.safeParse("$owned[1,2]").success).toBe(true);
    expect(schema.safeParse("owned").success).toBe(false);
    expect(z.globalRegistry.get(schema)?.description).toContain("nodes");
    expect(isRefSchema(z.string())).toBe(false);
  });

  it("accepts any collection when no target is given", () => {
    expect(refMeta(ref())?.target).toBeUndefined();
    expect(refMeta(ref({ description: "custom" }))?.target).toBeUndefined();
    expect(z.globalRegistry.get(ref({ description: "custom" }))?.description).toBe("custom");
  });

  it("resolves to a Collection at the type level", () => {
    const input = z.object({
      from: ref(Nodes),
      depth: z.number().default(1),
      tags: z.array(z.string()),
    });
    type R = Resolved<z.output<typeof input>>;
    expectTypeOf<R["from"]>().toEqualTypeOf<Collection<Node>>();
    expectTypeOf<R["depth"]>().toEqualTypeOf<number>();
    expectTypeOf<R["tags"]>().toEqualTypeOf<readonly string[]>();
  });
});

describe("collectRefs", () => {
  it("finds references in nested objects, arrays and optional wrappers", () => {
    const schema = z.object({
      from: ref(Nodes),
      extra: z.array(ref()).optional(),
      nested: z.object({ to: ref(Nodes).optional() }).optional(),
      plain: z.string(),
    });
    const parsed = schema.parse({
      from: "$a",
      extra: ["$b[2]", "$c"],
      nested: { to: "$d" },
      plain: "$notARef",
    });
    const sites = collectRefs(schema, parsed);
    expect(sites.map((s) => [formatPath(s.path), s.text])).toEqual([
      ["input.from", "$a"],
      ["input.extra[0]", "$b[2]"],
      ["input.extra[1]", "$c"],
      ["input.nested.to", "$d"],
    ]);
    expect(sites[1]?.parsed?.ordinals).toEqual([2]);
    expect(sites[0]?.meta.target).toBe(Nodes);
    expect(sites[1]?.meta.target).toBeUndefined();
  });

  it("follows unions and skips defaults that are not references", () => {
    const schema = z.object({ target: z.union([ref(Nodes), z.literal("all")]).default("all") });
    expect(collectRefs(schema, schema.parse({ target: "$x" }))).toHaveLength(1);
    expect(collectRefs(schema, schema.parse({}))).toHaveLength(0);
  });
});

describe("setAtPath and getAtPath", () => {
  it("replace without mutating and share untouched branches", () => {
    const root = { a: [{ b: 1 }, { b: 2 }] };
    const next = setAtPath(root, ["a", 1, "b"], 9) as typeof root;
    expect(next.a[1]?.b).toBe(9);
    expect(root.a[1]?.b).toBe(2);
    expect(next.a[0]).toBe(root.a[0]);
    expect(getAtPath(next, ["a", 1, "b"])).toBe(9);
    expect(getAtPath(next, ["a", 5, "b"])).toBeUndefined();
  });
});

describe("inputJsonSchema", () => {
  const schema = z.object({
    from: ref(Nodes),
    depth: z.union([z.number().int().min(1), z.literal("all")]).default("all"),
    fields: z.array(z.string()).optional(),
  });

  it("renders refs as pattern strings and keeps defaulted fields optional", () => {
    const json = inputJsonSchema(schema);
    expect(json.$schema).toBeUndefined();
    const props = json.properties as Record<string, Record<string, unknown>>;
    expect(props.from).toEqual({
      type: "string",
      pattern: REF_PATTERN_SOURCE,
      description: expect.stringContaining("nodes"),
    });
    expect(json.required).toEqual(["from"]);
    expect(props.depth?.default).toBe("all");
  });

  it("closes objects and requires every property in strict mode", () => {
    const json = inputJsonSchema(schema, { strict: true });
    expect(json.additionalProperties).toBe(false);
    expect(json.required).toEqual(["from", "depth", "fields"]);
  });
});

describe("summarizeSchema", () => {
  it("renders a compact TypeScript-like shape", () => {
    const schema = z.object({
      from: ref(Nodes),
      filters: z
        .array(z.object({ field: z.string(), op: z.enum(["eq", "fuzzy"]), value: z.string() }))
        .default([]),
      depth: z.union([z.number().int(), z.literal("all")]).optional(),
      any: ref(),
      limit: z.int().nullable(),
    });
    expect(summarizeSchema(schema)).toBe(
      '{ from: $ref<nodes>; filters?: { field: string; op: "eq" | "fuzzy"; value: string }[]; depth?: integer | "all"; any: $ref; limit: integer | null }',
    );
  });
});

describe("withSources", () => {
  it("marks provenance on a non-collection output", () => {
    const out = withSources(3, Nodes, [{ id: "1", label: "A" }]);
    expect(isStepOutput(out)).toBe(true);
    expect(out.data).toBe(3);
    expect(out.sources?.count).toBe(1);
    expect(isStepOutput({ data: 3 })).toBe(false);
  });
});
