import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineOperation } from "../operation.js";
import { REF_PATTERN_SOURCE } from "../refs/syntax.js";
import { ref } from "../schema/ref.js";
import { collection, groups, value, withSources } from "../schema/types.js";
import { describeOperations, REFERENCE_GUIDE } from "./describe.js";
import { buildPlanSchema } from "./planSchema.js";

const Node = z.object({ id: z.string(), label: z.string() });
const Nodes = collection("nodes", Node, { label: (n) => n.label });

const find = defineOperation({
  name: "nodes.find",
  description: "Find nodes.",
  input: z.object({ label: z.string().optional() }),
  output: Nodes,
  examples: [{ input: { label: "Acme" } }, { input: {}, note: "everything" }],
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
const total = defineOperation({
  name: "nodes.total",
  description: "A bare number.",
  input: z.object({}),
  output: value(z.number()),
  run: () => 0,
});
const by = defineOperation({
  name: "nodes.countBy",
  description: "Group.",
  input: z.object({ from: ref(Nodes), field: z.string() }),
  output: groups(),
  run: () => [],
});
const byWithSources = defineOperation({
  name: "nodes.countByKept",
  description: "Group and keep.",
  input: z.object({ from: ref(Nodes), field: z.string() }),
  output: groups(),
  sources: Nodes,
  run: () => [],
});

describe("describeOperations", () => {
  it("renders the intro, the reference guide and every operation in order", () => {
    const text = describeOperations([find, count]);
    expect(text.startsWith("Run one or more steps in a single call.")).toBe(true);
    expect(text).toContain(REFERENCE_GUIDE);
    expect(text.indexOf("- nodes.find")).toBeLessThan(text.indexOf("- nodes.count"));
  });

  it("renders examples with and without notes", () => {
    const text = describeOperations([find], { intro: false });
    expect(text).toBe(
      [
        "- nodes.find — Find nodes.",
        "  input: { label?: string }",
        "  returns: nodes",
        '  e.g. {"label":"Acme"}',
        "  e.g. (everything) {}",
      ].join("\n"),
    );
  });

  it("can omit examples and the intro", () => {
    const text = describeOperations([find], { intro: false, examples: false });
    expect(text).toBe("- nodes.find — Find nodes.\n  input: { label?: string }\n  returns: nodes");
  });

  it("describes value and group outputs, with provenance when declared", () => {
    const text = describeOperations([count, total, by, byWithSources], {
      intro: false,
      examples: false,
    });
    expect(text).toContain(
      "  returns: number (references resolve to the nodes it was computed from)",
    );
    expect(text).toContain("- nodes.total — A bare number.\n  input: {}\n  returns: number");
    expect(text).toContain(
      "- nodes.countBy — Group.\n  input: { from: $ref<nodes>; field: string }\n  returns: grouped counts",
    );
    expect(text).toContain("  returns: grouped counts (references resolve to the nodes counted)");
  });

  it("renders an empty list as just the intro", () => {
    const text = describeOperations([]);
    expect(text.endsWith("Operations:")).toBe(true);
    expect(describeOperations([], { intro: false })).toBe("");
  });
});

describe("buildPlanSchema", () => {
  const stepsOf = (schema: Record<string, unknown>) =>
    (schema.properties as { steps: Record<string, unknown> }).steps;

  it("wraps steps in a closed object with a non-empty array", () => {
    const schema = buildPlanSchema([find]);
    expect(schema).toMatchObject({
      type: "object",
      required: ["steps"],
      additionalProperties: false,
    });
    const steps = stepsOf(schema);
    expect(steps.type).toBe("array");
    expect(steps.minItems).toBe(1);
    expect(steps.maxItems).toBeUndefined();
    expect(String(steps.description)).toContain("$id");
  });

  it("union style: one closed variant per operation with the operation's input schema", () => {
    const variants = (
      stepsOf(buildPlanSchema([find, count])).items as { anyOf: Record<string, unknown>[] }
    ).anyOf;
    expect(variants).toHaveLength(2);
    const [first, second] = variants;
    expect(first).toMatchObject({
      type: "object",
      description: "Find nodes.",
      required: ["id", "op"],
      additionalProperties: false,
    });
    const props = first?.properties as Record<string, Record<string, unknown>>;
    expect(props.id).toMatchObject({ type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_]{0,63}$" });
    expect(props.op).toEqual({ const: "nodes.find" });
    expect(props.input).toMatchObject({ type: "object" });
    const countProps = second?.properties as Record<string, Record<string, unknown>>;
    const countInput = countProps.input?.properties as Record<string, Record<string, unknown>>;
    expect(countInput.from?.pattern).toBe(REF_PATTERN_SOURCE);
  });

  it("union style in strict mode requires input and closes nested inputs", () => {
    const variants = (
      stepsOf(buildPlanSchema([find], { strict: true })).items as {
        anyOf: Record<string, unknown>[];
      }
    ).anyOf;
    expect(variants[0]?.required).toEqual(["id", "op", "input"]);
    const props = variants[0]?.properties as Record<string, Record<string, unknown>>;
    const input = props.input;
    expect(input?.additionalProperties).toBe(false);
    expect(input?.required).toEqual(["label"]);
  });

  it("loose style: op is an enum and input is a free object", () => {
    const item = stepsOf(buildPlanSchema([find, count], { style: "loose" })).items as Record<
      string,
      unknown
    >;
    const props = item.properties as Record<string, Record<string, unknown>>;
    expect(props.op?.enum).toEqual(["nodes.find", "nodes.count"]);
    expect(props.input).toEqual({ type: "object", description: "Arguments for the operation." });
    expect(item.required).toEqual(["id", "op"]);
    expect(item.additionalProperties).toBe(false);
  });

  it("applies maxSteps to the array", () => {
    expect(stepsOf(buildPlanSchema([find], { maxSteps: 7 })).maxItems).toBe(7);
  });

  it("builds an empty union for no operations", () => {
    expect((stepsOf(buildPlanSchema([])).items as { anyOf: unknown[] }).anyOf).toEqual([]);
  });

  it("is plain JSON", () => {
    const schema = buildPlanSchema([find, count], { strict: true });
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  });
});
