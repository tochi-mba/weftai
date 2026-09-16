import { describe, expect, it } from "vitest";
import { z } from "zod";
import { REF_PATTERN_SOURCE } from "../refs/syntax.js";
import { inputJsonSchema, type JsonSchema } from "./json.js";
import { ref } from "./ref.js";
import { collection } from "./types.js";

const Node = z.object({ id: z.string(), label: z.string() });
const Nodes = collection("nodes", Node, { label: (n) => n.label });

type Props = Record<string, JsonSchema>;
const propsOf = (json: JsonSchema) => json.properties as Props;

describe("inputJsonSchema: references", () => {
  it("renders a ref as a string constrained by the strict grammar with its description", () => {
    const json = inputJsonSchema(z.object({ from: ref(Nodes) }));
    expect(propsOf(json).from).toEqual({
      type: "string",
      pattern: REF_PATTERN_SOURCE,
      description: expect.stringContaining("nodes result"),
    });
  });

  it("keeps a custom description", () => {
    const json = inputJsonSchema(z.object({ from: ref(Nodes, { description: "Parent." }) }));
    expect(propsOf(json).from?.description).toBe("Parent.");
  });

  it("renders refs inside arrays, records, optionals and unions", () => {
    const json = inputJsonSchema(
      z.object({
        many: z.array(ref(Nodes)),
        byKey: z.record(z.string(), ref(Nodes)),
        maybe: ref(Nodes).optional(),
        either: z.union([ref(Nodes), z.literal("all")]),
        orNull: ref(Nodes).nullable(),
      }),
    );
    const props = propsOf(json);
    expect(props.many).toMatchObject({ items: { pattern: REF_PATTERN_SOURCE } });
    expect(props.byKey).toMatchObject({ additionalProperties: { pattern: REF_PATTERN_SOURCE } });
    expect(props.maybe?.pattern).toBe(REF_PATTERN_SOURCE);
    const eitherOptions = props.either?.anyOf as JsonSchema[];
    expect(eitherOptions.some((o) => o.pattern === REF_PATTERN_SOURCE)).toBe(true);
    const nullOptions = props.orNull?.anyOf as JsonSchema[];
    expect(nullOptions.some((o) => o.pattern === REF_PATTERN_SOURCE)).toBe(true);
    expect(nullOptions.some((o) => o.type === "null")).toBe(true);
    expect(json.required).toEqual(["many", "byKey", "either", "orNull"]);
  });

  it("does not touch ordinary strings, even ones with their own pattern", () => {
    const json = inputJsonSchema(z.object({ code: z.string().regex(/^[A-Z]{3}$/) }));
    expect(propsOf(json).code?.pattern).toBe("^[A-Z]{3}$");
    expect(propsOf(json).code?.description).toBeUndefined();
  });
});

describe("inputJsonSchema: ordinary fields", () => {
  const schema = z.object({
    label: z.string().describe("Entity label."),
    op: z.enum(["eq", "fuzzy"]),
    mode: z.literal("all"),
    depth: z.number().int().min(1).max(10),
    ratio: z.number(),
    flag: z.boolean().default(false),
    tags: z.array(z.string()).optional(),
    nested: z.object({ inner: z.string() }),
    anything: z.unknown(),
    when: z.date(),
  });

  it("uses the input side: defaults and optionals are not required", () => {
    const json = inputJsonSchema(schema);
    expect(json.required).toEqual([
      "label",
      "op",
      "mode",
      "depth",
      "ratio",
      "nested",
      "anything",
      "when",
    ]);
    expect(propsOf(json).flag?.default).toBe(false);
  });

  it("maps common Zod types to their JSON Schema equivalents", () => {
    const props = propsOf(inputJsonSchema(schema));
    expect(props.label).toEqual({ type: "string", description: "Entity label." });
    expect(props.op).toEqual({ type: "string", enum: ["eq", "fuzzy"] });
    expect(props.mode).toEqual({ type: "string", const: "all" });
    expect(props.depth).toMatchObject({ type: "integer", minimum: 1, maximum: 10 });
    expect(props.ratio).toEqual({ type: "number" });
    expect(props.nested).toMatchObject({ type: "object", required: ["inner"] });
  });

  it("renders unrepresentable types as unconstrained instead of throwing", () => {
    const props = propsOf(inputJsonSchema(schema));
    expect(props.anything).toEqual({});
    expect(props.when).toEqual({});
  });

  it("strips the $schema marker so the result embeds in a tool definition", () => {
    expect(inputJsonSchema(schema).$schema).toBeUndefined();
  });

  it("is deterministic and leaves the Zod schema usable", () => {
    const first = inputJsonSchema(schema);
    const second = inputJsonSchema(schema);
    expect(first).toEqual(second);
    expect(
      schema.safeParse({
        label: "x",
        op: "eq",
        mode: "all",
        depth: 1,
        ratio: 0.5,
        nested: { inner: "i" },
        anything: 1,
        when: new Date(),
      }).success,
    ).toBe(true);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it("renders an empty object schema", () => {
    const json = inputJsonSchema(z.object({}));
    expect(json.type).toBe("object");
    expect(json.properties).toEqual({});
  });
});

describe("inputJsonSchema: strict mode", () => {
  const schema = z.object({
    from: ref(Nodes),
    depth: z.union([z.number().int().min(1), z.literal("all")]).default("all"),
    filters: z.array(z.object({ field: z.string(), value: z.string().optional() })).default([]),
  });

  it("closes every object and requires every property, including nested ones", () => {
    const json = inputJsonSchema(schema, { strict: true });
    expect(json.additionalProperties).toBe(false);
    expect(json.required).toEqual(["from", "depth", "filters"]);
    const item = (propsOf(json).filters?.items as JsonSchema) ?? {};
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(["field", "value"]);
  });

  it("leaves objects open and optionals optional when strict is off", () => {
    const json = inputJsonSchema(schema, { strict: false });
    expect(json.required).toEqual(["from"]);
    const item = (propsOf(json).filters?.items as JsonSchema) ?? {};
    expect(item.required).toEqual(["field"]);
  });

  it("still renders references in strict mode", () => {
    const json = inputJsonSchema(schema, { strict: true });
    expect(propsOf(json).from?.pattern).toBe(REF_PATTERN_SOURCE);
  });
});
