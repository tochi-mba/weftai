/**
 * Small branches that no scenario reaches naturally. Each test names the branch it covers so a
 * future refactor that removes the branch can remove the test with it.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { normalizeOutput } from "./executor/normalize.js";
import { mapPool } from "./executor/pool.js";
import { bindTimeout, whenAborted } from "./executor/signals.js";
import type { StepResult } from "./executor/types.js";
import { createFormatter } from "./format/formatter.js";
import { estimateTokens } from "./format/tokens.js";
import { defineOperation } from "./operation.js";
import { validatePlan } from "./plan/validate.js";
import { createRegistry } from "./registry.js";
import { inputJsonSchema } from "./schema/json.js";
import { ref } from "./schema/ref.js";
import { summarizeSchema } from "./schema/summarize.js";
import { collection, value } from "./schema/types.js";
import { collectRefs } from "./schema/walk.js";
import { compareGroups } from "./std/operations.js";

const Node = z.object({ id: z.string(), label: z.string() });
const Nodes = collection("nodes", Node, { label: (n) => n.label, key: (n) => n.id });
const find = defineOperation({
  name: "nodes.find",
  description: "Find.",
  input: z.object({}),
  output: Nodes,
  run: () => [],
});
const total = defineOperation({
  name: "nodes.total",
  description: "A bare number with no entities behind it.",
  input: z.object({}),
  output: value(z.number()),
  run: () => 0,
});
const pass = defineOperation({
  name: "nodes.pass",
  description: "Pass.",
  input: z.object({ from: ref(Nodes) }),
  output: Nodes,
  run: ({ input }) => input.from.items,
});
const registry = createRegistry({ operations: [find, total, pass] });

describe("estimateTokens", () => {
  it("is zero for the empty string and rounds up otherwise", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("validatePlan: reference targets", () => {
  it("does not type-check a reference to a step whose operation is unknown; that step is reported instead", () => {
    const result = validatePlan(
      {
        steps: [
          { id: "a", op: "nodes.nope" },
          { id: "b", op: "nodes.pass", input: { from: "$a" } },
        ],
      },
      registry,
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.map((i) => [i.code, i.stepId])).toEqual([
        ["step.unknown_operation", "a"],
      ]);
  });

  it("names a single-value result that has no entities to reference", () => {
    const result = validatePlan(
      {
        steps: [
          { id: "n", op: "nodes.total" },
          { id: "b", op: "nodes.pass", input: { from: "$n" } },
        ],
      },
      registry,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.message).toBe(
        "input.from references '$n', but its single-value result has no entities to reference.",
      );
    }
  });
});

describe("inputJsonSchema: strict mode and records", () => {
  it("keeps a record's value schema as additionalProperties", () => {
    const json = inputJsonSchema(z.object({ r: z.record(z.string(), z.number()) }), {
      strict: true,
    });
    const props = json.properties as Record<string, Record<string, unknown>>;
    expect(props.r?.additionalProperties).toEqual({ type: "number" });
    expect(json.additionalProperties).toBe(false);
  });
});

describe("summarizeSchema: number checks", () => {
  it("keeps a bounded number a number and an int an integer", () => {
    expect(summarizeSchema(z.number().min(1))).toBe("number");
    expect(summarizeSchema(z.number().int().min(1))).toBe("integer");
  });
});

describe("collectRefs: union with no matching member", () => {
  it("collects nothing when the raw value matches no option", () => {
    const schema = z.object({ u: z.union([ref(Nodes), z.literal("all")]) });
    expect(collectRefs(schema, { u: 42 })).toEqual([]);
  });

  it("ignores tuple positions the raw value does not have, and non-array tuple values", () => {
    const schema = z.tuple([ref(Nodes), ref(Nodes)]);
    expect(collectRefs(schema, ["$a"]).map((site) => site.text)).toEqual(["$a"]);
    expect(collectRefs(schema, "not a tuple")).toEqual([]);
  });
});

describe("registry.require", () => {
  it("returns a known operation", () => {
    expect(registry.require("nodes.find")).toBe(find);
  });
});

describe("compareGroups", () => {
  it("orders by count, then key, and puts not recorded last from either side", () => {
    const missing = { key: "not recorded", count: 9 };
    const a = { key: "A", count: 1 };
    const b = { key: "B", count: 1 };
    expect(compareGroups(missing, a)).toBe(1);
    expect(compareGroups(a, missing)).toBe(-1);
    expect(compareGroups(a, b)).toBeLessThan(0);
    expect(compareGroups(b, a)).toBeGreaterThan(0);
    expect(compareGroups({ key: "A", count: 2 }, b)).toBeLessThan(0);
    expect(compareGroups(missing, { ...missing })).toBe(0);
  });
});

describe("normalizeOutput: wrong shapes", () => {
  it("describes null and primitives in the error", () => {
    expect(() => normalizeOutput(find as never, null, "s")).toThrow(
      "The handler for 'nodes.find' must return an array of nodes, not null.",
    );
    expect(() => normalizeOutput(find as never, 5, "s")).toThrow(/not number\./);
    expect(() => normalizeOutput(find as never, {}, "s")).toThrow(/not object\./);
  });
});

describe("mapPool", () => {
  it("passes every item including falsy ones", async () => {
    const seen: unknown[] = [];
    await mapPool([0, "", undefined, null], 2, async (item) => {
      seen.push(item);
      return item;
    });
    expect(seen).toEqual([0, "", undefined, null]);
  });
});

describe("bindTimeout", () => {
  it("keeps the timeout reason when the parent aborts afterwards", async () => {
    const parent = new AbortController();
    const bound = bindTimeout(parent.signal, 1, () => "timeout");
    await whenAborted(bound.signal);
    parent.abort("late");
    expect(bound.signal.reason).toBe("timeout");
    bound.dispose();
  });
});

describe("formatter: unusual step shapes", () => {
  const formatter = createFormatter();
  const base: StepResult = {
    id: "x",
    operation: "nodes.find",
    status: "ok",
    kind: "collection",
    type: "nodes",
    count: undefined,
    data: undefined,
    items: undefined,
    notices: [],
    fields: undefined,
    error: undefined,
    skippedBecause: undefined,
    durationMs: 0,
    startedAt: 0,
    referenced: false,
    present: "full",
    replaced: false,
  };

  it("renders a collection with neither count nor items as zero", () => {
    expect(formatter.format({ registry, ctx: {}, steps: [base] })).toBe("x (nodes): 0 matched");
  });

  it("falls back to plain labels when the operation's output is not a collection", () => {
    const step: StepResult = {
      ...base,
      operation: "nodes.total",
      count: 1,
      items: [{ label: "L" }],
    };
    expect(formatter.format({ registry, ctx: {}, steps: [step] })).toBe(
      "x (nodes): 1 matched\n  1. L",
    );
  });

  it("rewrites an existing showing notice when the total budget trims further", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ id: String(i), label: `N${i}` }));
    const tight = createFormatter({
      budgets: { read: 5, preview: 5, total: 4 },
      estimateTokens: () => 1,
    });
    const text = tight.format({
      registry,
      ctx: {},
      steps: [{ ...base, count: 6, items }],
    });
    expect(text).toContain("x (nodes): 6 matched");
    expect(text.match(/showing \d+ of 6/g)).toHaveLength(1);
    expect(text).toContain("Shown headers for all 1 steps");
  });

  it("stops trimming when nothing is left to trim", () => {
    const tight = createFormatter({
      budgets: { read: 100, preview: 100, total: 1 },
      estimateTokens: () => 1,
    });
    const text = tight.format({ registry, ctx: {}, steps: [{ ...base, count: 0, items: [] }] });
    expect(text).toBe("x (nodes): 0 matched");
  });
});
