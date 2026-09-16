import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineOperation } from "../operation.js";
import { collection } from "../schema/types.js";
import { compilePlanSchema, containsAnyOf } from "./dialects.js";

const Node = z.object({ id: z.string(), label: z.string() });
const Nodes = collection("nodes", Node, { label: (n) => n.label });
const find = defineOperation({
  name: "nodes.find",
  description: "Find.",
  input: z.object({ q: z.string().optional() }),
  output: Nodes,
  run: () => [],
});
const pass = defineOperation({
  name: "nodes.pass",
  description: "Pass.",
  input: z.object({}),
  output: Nodes,
  run: () => [],
});

describe("containsAnyOf", () => {
  it("walks arrays, objects and primitives", () => {
    expect(containsAnyOf("x")).toBe(false);
    expect(containsAnyOf(1)).toBe(false);
    expect(containsAnyOf(null)).toBe(false);
    expect(containsAnyOf([{ anyOf: [] }])).toBe(true);
    expect(containsAnyOf({ nested: { anyOf: [{ type: "string" }] } })).toBe(true);
    expect(containsAnyOf({ type: "object" })).toBe(false);
  });
});

describe("compilePlanSchema", () => {
  it("emits a union with anyOf for two operations", () => {
    const schema = compilePlanSchema([find, pass], "union");
    expect(containsAnyOf(schema)).toBe(true);
    expect(schema.additionalProperties).toBe(false);
  });

  it("falls back to loose when openai-strict would emit anyOf", () => {
    const two = compilePlanSchema([find, pass], "openai-strict");
    expect(containsAnyOf(two)).toBe(false);
    const one = compilePlanSchema([find], "openai-strict");
    expect((one.properties as { steps: { items: unknown } }).steps.items).toMatchObject({
      type: "object",
    });
  });

  it("closes a loose schema and restricts Nova objects", () => {
    const loose = compilePlanSchema([find], "loose");
    expect(loose.additionalProperties).toBe(false);
    const nova = compilePlanSchema([find], "bedrock-nova");
    expect(nova.type).toBe("object");
    expect("additionalProperties" in nova).toBe(false);
    expect(nova.required).toEqual(["steps"]);
  });

  it("strips unsupported Gemini keywords and uppercases Vertex types", () => {
    const gemini = compilePlanSchema([find, pass], "gemini-openapi");
    expect(JSON.stringify(gemini)).not.toContain("additionalProperties");
    expect(JSON.stringify(gemini)).not.toContain("unevaluatedProperties");
    const vertex = compilePlanSchema([find], "gemini-vertex");
    expect(vertex.type).toBe("OBJECT");
  });

  it("compiles the anthropic dialect as a closed union", () => {
    const schema = compilePlanSchema([find], "anthropic");
    expect(schema.additionalProperties).toBe(false);
    const relaxed = compilePlanSchema([find, pass], "anthropic", { strict: false });
    type Schema = { steps: { items: { anyOf: { required: string[] }[] } } };
    expect((relaxed.properties as Schema).steps.items.anyOf[0]?.required).toEqual(["id", "op"]);
  });

  it("honours maxSteps", () => {
    const schema = compilePlanSchema([find], "union", { maxSteps: 3, strict: true });
    expect((schema.properties as { steps: { maxItems: number } }).steps.maxItems).toBe(3);
  });
});
