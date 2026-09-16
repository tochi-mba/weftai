import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ref } from "./ref.js";
import { summarizeSchema } from "./summarize.js";
import { collection } from "./types.js";

const Node = z.object({ id: z.string(), label: z.string() });
const Nodes = collection("nodes", Node, { label: (n) => n.label });

describe("summarizeSchema: primitives", () => {
  it.each([
    [z.string(), "string"],
    [z.number(), "number"],
    [z.number().int(), "integer"],
    [z.int(), "integer"],
    [z.int32(), "integer"],
    [z.uint32(), "integer"],
    [z.float64(), "number"],
    [z.boolean(), "boolean"],
    [z.bigint(), "bigint"],
    [z.date(), "date"],
    [z.null(), "null"],
    [z.undefined(), "undefined"],
    [z.void(), "undefined"],
    [z.any(), "unknown"],
    [z.unknown(), "unknown"],
    [z.never(), "unknown"],
    [z.symbol(), "unknown"],
    [z.string().min(1).max(10), "string"],
    [z.email(), "string"],
    [z.uuid(), "string"],
  ])("renders %o as %s", (schema, expected) => {
    expect(summarizeSchema(schema as z.ZodType)).toBe(expected);
  });
});

describe("summarizeSchema: literals and enums", () => {
  it("renders literals as JSON", () => {
    expect(summarizeSchema(z.literal("all"))).toBe('"all"');
    expect(summarizeSchema(z.literal(1))).toBe("1");
    expect(summarizeSchema(z.literal(true))).toBe("true");
    expect(summarizeSchema(z.literal(["a", "b"]))).toBe('"a" | "b"');
  });

  it("renders enums as a union of their values", () => {
    expect(summarizeSchema(z.enum(["eq", "fuzzy"]))).toBe('"eq" | "fuzzy"');
    expect(summarizeSchema(z.enum(["only"]))).toBe('"only"');
  });
});

describe("summarizeSchema: containers", () => {
  it("renders arrays, parenthesising top-level unions but not braces", () => {
    expect(summarizeSchema(z.array(z.string()))).toBe("string[]");
    expect(summarizeSchema(z.array(z.array(z.number())))).toBe("number[][]");
    expect(summarizeSchema(z.array(z.string().nullable()))).toBe("(string | null)[]");
    expect(summarizeSchema(z.array(z.union([z.string(), z.number()])))).toBe("(string | number)[]");
    expect(summarizeSchema(z.array(z.object({ a: z.string() })))).toBe("{ a: string }[]");
    expect(summarizeSchema(z.array(z.tuple([z.string()])))).toBe("[string][]");
    expect(
      summarizeSchema(
        z.array(z.intersection(z.object({ a: z.string() }), z.object({ b: z.string() }))),
      ),
    ).toBe("({ a: string } & { b: string })[]");
    expect(
      summarizeSchema(z.array(z.union([z.object({ a: z.string() }), z.object({ b: z.number() })]))),
    ).toBe("({ a: string } | { b: number })[]");
    expect(summarizeSchema(z.array(z.object({ a: z.union([z.string(), z.number()]) })))).toBe(
      "{ a: string | number }[]",
    );
    expect(summarizeSchema(z.array(z.record(z.string(), z.union([z.string(), z.number()]))))).toBe(
      "Record<string, string | number>[]",
    );
  });

  it("renders tuples", () => {
    expect(summarizeSchema(z.tuple([z.string(), z.number()]))).toBe("[string, number]");
    expect(summarizeSchema(z.tuple([]))).toBe("[]");
  });

  it("renders objects with optional markers for optional, default and prefault fields", () => {
    const schema = z.object({
      a: z.string(),
      b: z.string().optional(),
      c: z.number().default(1),
      d: z.string().prefault("x"),
      e: z.string().nullable(),
      f: z.string().nullable().optional(),
    });
    expect(summarizeSchema(schema)).toBe(
      "{ a: string; b?: string; c?: integer | number; d?: string; e: string | null; f?: string | null }".replace(
        "integer | number",
        "number",
      ),
    );
  });

  it("renders an empty object", () => {
    expect(summarizeSchema(z.object({}))).toBe("{}");
  });

  it("renders records", () => {
    expect(summarizeSchema(z.record(z.string(), z.number()))).toBe("Record<string, number>");
  });

  it("renders unions and intersections", () => {
    expect(summarizeSchema(z.union([z.string(), z.literal(1), z.null()]))).toBe(
      "string | 1 | null",
    );
    expect(
      summarizeSchema(z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() }))),
    ).toBe("{ a: string } & { b: number }");
  });
});

describe("summarizeSchema: wrappers", () => {
  it("looks through optional, default, readonly, catch and nonoptional at the top level", () => {
    expect(summarizeSchema(z.string().optional())).toBe("string");
    expect(summarizeSchema(z.string().default("x"))).toBe("string");
    expect(summarizeSchema(z.string().readonly())).toBe("string");
    expect(summarizeSchema(z.string().catch("x"))).toBe("string");
    expect(summarizeSchema(z.string().optional().nonoptional())).toBe("string");
  });

  it("renders nullable as a union with null", () => {
    expect(summarizeSchema(z.number().nullable())).toBe("number | null");
  });

  it("uses the input side of transforms and pipes", () => {
    expect(summarizeSchema(z.string().transform((s) => s.length))).toBe("string");
    expect(summarizeSchema(z.string().pipe(z.string().min(1)))).toBe("string");
  });

  it("resolves lazy schemas", () => {
    expect(summarizeSchema(z.lazy(() => z.object({ a: z.string() })))).toBe("{ a: string }");
  });
});

describe("summarizeSchema: references and depth", () => {
  it("renders targeted and untargeted references", () => {
    expect(summarizeSchema(ref(Nodes))).toBe("$ref<nodes>");
    expect(summarizeSchema(ref())).toBe("$ref");
    expect(summarizeSchema(z.object({ from: ref(Nodes).optional(), all: z.array(ref()) }))).toBe(
      "{ from?: $ref<nodes>; all: $ref[] }",
    );
  });

  it("renders the canonical operation input shape", () => {
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

  it("stops at the depth limit with an ellipsis", () => {
    let schema: z.ZodType = z.string();
    for (let i = 0; i < 8; i++) schema = z.object({ next: schema });
    const text = summarizeSchema(schema);
    expect(text).toContain("…");
    expect(text).not.toContain("string");
  });

  it("does not count wrappers against the depth limit", () => {
    let schema: z.ZodType = z.string();
    for (let i = 0; i < 20; i++) schema = schema.optional();
    expect(summarizeSchema(schema)).toBe("string");
  });
});
