import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineOperation } from "../operation.js";
import { createRegistry } from "../registry.js";
import { ref } from "../schema/ref.js";
import { collection, groups, value, withSources } from "../schema/types.js";
import { type SessionView, validatePlan } from "./validate.js";

const Node = z.object({ id: z.string(), label: z.string() });
const Nodes = collection("nodes", Node, { label: (n) => n.label });
const Edge = z.object({ from: z.string(), to: z.string() });
const Edges = collection("edges", Edge, { label: (e) => `${e.from} to ${e.to}` });

const registry = createRegistry({
  operations: [
    defineOperation({
      name: "nodes.find",
      description: "Find nodes.",
      input: z.object({ label: z.string().optional(), limit: z.number().int().default(10) }),
      output: Nodes,
      run: () => [],
    }),
    defineOperation({
      name: "nodes.descendants",
      description: "Walk down.",
      input: z.object({
        from: ref(Nodes),
        depth: z.union([z.number(), z.literal("all")]).default("all"),
      }),
      output: Nodes,
      present: "full",
      run: () => [],
    }),
    defineOperation({
      name: "nodes.count",
      description: "Count.",
      input: z.object({ from: ref(Nodes) }),
      output: value(z.number()),
      sources: Nodes,
      run: ({ input }) => withSources(input.from.count, Nodes, input.from.items),
    }),
    defineOperation({
      name: "nodes.countBy",
      description: "Group.",
      input: z.object({ from: ref(Nodes), field: z.string() }),
      output: groups(),
      run: () => [],
    }),
    defineOperation({
      name: "edges.between",
      description: "Edges between.",
      input: z.object({ from: ref(Nodes), to: ref(Nodes) }),
      output: Edges,
      run: () => [],
    }),
    defineOperation({
      name: "selection.select",
      description: "Select.",
      input: z.object({ refs: z.array(ref()) }),
      output: value(z.number()),
      effects: "write",
      run: () => 0,
    }),
  ],
});

function issuesOf(plan: unknown, options?: Parameters<typeof validatePlan>[2]) {
  const result = validatePlan(plan, registry, options);
  return result.ok ? [] : result.issues;
}

function stepsOf(plan: unknown, options?: Parameters<typeof validatePlan>[2]) {
  const result = validatePlan(plan, registry, options);
  if (!result.ok) throw new Error(result.issues.map((i) => i.message).join("; "));
  return result.plan;
}

describe("validatePlan: accepted plans", () => {
  it("accepts a chained plan, applies defaults and computes dependencies and levels", () => {
    const plan = stepsOf({
      steps: [
        { id: "acme", op: "nodes.find", input: { label: "Acme" } },
        { id: "other", op: "nodes.find" },
        { id: "owned", op: "nodes.descendants", input: { from: "$acme" } },
        { id: "links", op: "edges.between", input: { from: "$acme", to: "$owned[1,2]" } },
      ],
    });
    const [acme, other, owned, links] = plan.steps;
    expect(acme?.input).toEqual({ label: "Acme", limit: 10 });
    expect(other?.input).toEqual({ limit: 10 });
    expect(owned?.input).toEqual({ from: "$acme", depth: "all" });
    expect(owned?.dependencies).toEqual(["acme"]);
    expect(links?.dependencies).toEqual(["acme", "owned"]);
    expect(links?.refs.map((r) => [r.ref.id, r.ref.ordinals, r.source])).toEqual([
      ["acme", undefined, "plan"],
      ["owned", [1, 2], "plan"],
    ]);
    expect(plan.steps.map((s) => s.referenced)).toEqual([true, false, true, false]);
    expect(plan.levels.map((level) => level.map((s) => s.id))).toEqual([
      ["acme", "other"],
      ["owned"],
      ["links"],
    ]);
    expect(plan.steps.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });

  it("uses the operation's presentation unless the step overrides it", () => {
    const plan = stepsOf({
      steps: [
        { id: "a", op: "nodes.find" },
        { id: "b", op: "nodes.descendants", input: { from: "$a" } },
        { id: "c", op: "nodes.descendants", input: { from: "$a" }, present: "preview" },
      ],
    });
    expect(plan.steps.map((s) => s.present)).toEqual(["auto", "full", "preview"]);
  });

  it("puts independent steps in the first level and diamonds in the right order", () => {
    const plan = stepsOf({
      steps: [
        { id: "a", op: "nodes.find" },
        { id: "b", op: "nodes.find" },
        { id: "c", op: "nodes.descendants", input: { from: "$a" } },
        { id: "d", op: "nodes.descendants", input: { from: "$b" } },
        { id: "e", op: "edges.between", input: { from: "$c", to: "$d" } },
        { id: "g", op: "nodes.descendants", input: { from: "$d" } },
        { id: "f", op: "edges.between", input: { from: "$g", to: "$a" } },
      ],
    });
    expect(plan.levels.map((level) => level.map((s) => s.id))).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "g"],
      ["f"],
    ]);
    expect(plan.steps.map((s) => s.referenced)).toEqual([
      true,
      true,
      true,
      true,
      false,
      true,
      false,
    ]);
  });

  it("counts a step referenced twice as one dependency", () => {
    const plan = stepsOf({
      steps: [
        { id: "a", op: "nodes.find" },
        { id: "e", op: "edges.between", input: { from: "$a", to: "$a[1]" } },
      ],
    });
    expect(plan.steps[1]?.dependencies).toEqual(["a"]);
    expect(plan.steps[1]?.refs).toHaveLength(2);
  });

  it("allows write operations by default", () => {
    expect(issuesOf({ steps: [{ id: "a", op: "selection.select", input: { refs: [] } }] })).toEqual(
      [],
    );
  });

  it("does not check ordinals against plan steps, whose sizes are unknown until execution", () => {
    expect(
      issuesOf({
        steps: [
          { id: "a", op: "nodes.find" },
          { id: "b", op: "nodes.descendants", input: { from: "$a[999]" } },
        ],
      }),
    ).toEqual([]);
  });

  it("accepts an untargeted reference to any collection", () => {
    const plan = stepsOf({
      steps: [
        { id: "a", op: "nodes.find" },
        { id: "e", op: "edges.between", input: { from: "$a", to: "$a" } },
        { id: "s", op: "selection.select", input: { refs: ["$a", "$e[1]"] } },
      ],
    });
    expect(plan.steps[2]?.dependencies).toEqual(["a", "e"]);
  });
});

describe("validatePlan: plan shape", () => {
  it("rejects an empty step list", () => {
    const [issue] = issuesOf({ steps: [] });
    expect(issue).toMatchObject({ code: "plan.invalid_shape" });
    expect(issue?.message).toContain("input.steps");
    expect(issue?.hint).toContain('"steps"');
  });

  it("rejects non-objects", () => {
    for (const bad of ["nope", 1, null, undefined, [], { step: [] }]) {
      expect(issuesOf(bad)[0]?.code, JSON.stringify(bad)).toBe("plan.invalid_shape");
    }
  });

  it("rejects unknown keys on a step so a mis-named field is not silently ignored", () => {
    const [issue] = issuesOf({ steps: [{ id: "a", operation: "nodes.find" }] });
    expect(issue?.code).toBe("plan.invalid_shape");
    expect(issue?.message).toContain("operation");
  });

  it("rejects a bad present value", () => {
    expect(issuesOf({ steps: [{ id: "a", op: "nodes.find", present: "big" }] })[0]?.code).toBe(
      "plan.invalid_shape",
    );
  });

  it("rejects a non-object input", () => {
    const [issue] = issuesOf({ steps: [{ id: "a", op: "nodes.find", input: "x" }] });
    expect(issue?.code).toBe("plan.invalid_shape");
    expect(issue?.message).toContain("input.steps[0].input");
  });

  it("caps the number of steps", () => {
    const steps = Array.from({ length: 3 }, (_, i) => ({ id: `s${i}`, op: "nodes.find" }));
    expect(issuesOf({ steps }, { maxSteps: 2 })[0]).toMatchObject({
      code: "plan.too_many_steps",
      message: "The plan has 3 steps; at most 2 are allowed per call.",
    });
    expect(issuesOf({ steps }, { maxSteps: 3 })).toEqual([]);
  });
});

describe("validatePlan: step ids and operations", () => {
  it("reports invalid and duplicate ids", () => {
    const issues = issuesOf({
      steps: [
        { id: "1st", op: "nodes.find" },
        { id: "a", op: "nodes.find" },
        { id: "a", op: "nodes.find" },
      ],
    });
    expect(issues.map((i) => i.code)).toEqual(["step.invalid_id", "step.duplicate_id"]);
    expect(issues[0]?.hint).toContain("Step ids start with a letter");
    expect(issues[1]?.message).toBe("Step id 'a' is used more than once in this plan.");
  });

  it("suggests the nearest operation name", () => {
    const [issue] = issuesOf({ steps: [{ id: "a", op: "nodes.fnd" }] });
    expect(issue).toMatchObject({
      code: "step.unknown_operation",
      stepId: "a",
      message: "Unknown operation 'nodes.fnd'.",
      hint: "Did you mean 'nodes.find'?",
    });
  });

  it("lists every operation when nothing is close", () => {
    const [issue] = issuesOf({ steps: [{ id: "a", op: "zzz" }] });
    expect(issue?.hint).toBe(
      "Available operations: nodes.find, nodes.descendants, nodes.count, nodes.countBy, edges.between, selection.select.",
    );
  });

  it("rejects write operations when the tool is read-only", () => {
    const [issue] = issuesOf(
      { steps: [{ id: "a", op: "selection.select", input: { refs: [] } }] },
      { allowWrites: false },
    );
    expect(issue).toMatchObject({
      code: "step.write_not_allowed",
      message: "Operation 'selection.select' changes state and cannot be used in this tool.",
    });
  });

  it("rewrites input schema failures with the field path and expected shape", () => {
    const [issue] = issuesOf({ steps: [{ id: "a", op: "nodes.find", input: { limit: "ten" } }] });
    expect(issue).toMatchObject({ code: "step.invalid_input", stepId: "a", path: ["limit"] });
    expect(issue?.message).toMatch(/^input\.limit: /);
    expect(issue?.hint).toBe("Expected input: { label?: string; limit?: integer }");
  });

  it("reports one issue per invalid input field", () => {
    const issues = issuesOf({
      steps: [{ id: "a", op: "nodes.find", input: { limit: "ten", label: 5 } }],
    });
    expect(issues.map((i) => i.path)).toEqual([["label"], ["limit"]]);
  });

  it("keeps reporting later steps after an earlier one fails", () => {
    const issues = issuesOf({
      steps: [
        { id: "a", op: "nodes.nope" },
        { id: "b", op: "nodes.find", input: { limit: "x" } },
      ],
    });
    expect(issues.map((i) => [i.code, i.stepId])).toEqual([
      ["step.unknown_operation", "a"],
      ["step.invalid_input", "b"],
    ]);
  });
});

describe("validatePlan: references", () => {
  it("reports every reference problem with its path", () => {
    const issues = issuesOf({
      steps: [
        { id: "a", op: "nodes.find" },
        { id: "b", op: "nodes.descendants", input: { from: "$b" } },
        { id: "c", op: "nodes.descendants", input: { from: "$d" } },
        { id: "d", op: "nodes.descendants", input: { from: "$nope" } },
        { id: "e", op: "nodes.descendants", input: { from: "$a[0]" } },
      ],
    });
    expect(issues.map((i) => [i.code, i.stepId, i.path])).toEqual([
      ["ref.self_reference", "b", ["from"]],
      ["ref.forward_reference", "c", ["from"]],
      ["ref.unknown_target", "d", ["from"]],
      ["ref.invalid_syntax", "e", ["from"]],
    ]);
    expect(issues[0]?.message).toBe("input.from references '$b', which is this step itself.");
    expect(issues[1]?.message).toBe(
      "input.from references '$d', which is defined later in the plan.",
    );
    expect(issues[2]?.message).toBe(
      "input.from references '$nope', but no earlier step or stored result is named 'nope'.",
    );
    expect(issues[2]?.hint).toBeUndefined();
    expect(issues[3]?.message).toContain("positions are 1-based");
  });

  it("reports reference paths inside arrays", () => {
    const [issue] = issuesOf({
      steps: [{ id: "s", op: "selection.select", input: { refs: ["$missing"] } }],
    });
    expect(issue?.path).toEqual(["refs", 0]);
    expect(issue?.message).toMatch(/^input\.refs\[0\] references/);
  });

  it("suggests a near-miss step id, only among earlier steps", () => {
    const [issue] = issuesOf({
      steps: [
        { id: "owned", op: "nodes.find" },
        { id: "b", op: "nodes.descendants", input: { from: "$owner" } },
      ],
    });
    expect(issue?.hint).toBe("Did you mean '$owned'?");
    const [forward] = issuesOf({
      steps: [
        { id: "b", op: "nodes.descendants", input: { from: "$owner" } },
        { id: "owned", op: "nodes.find" },
      ],
    });
    expect(forward?.code).toBe("ref.unknown_target");
    expect(forward?.hint).toBeUndefined();
  });

  it("type-checks references against what the target step produces", () => {
    const issues = issuesOf({
      steps: [
        { id: "a", op: "nodes.find" },
        { id: "links", op: "edges.between", input: { from: "$a", to: "$a" } },
        { id: "byLabel", op: "nodes.countBy", input: { from: "$a", field: "label" } },
        { id: "n", op: "nodes.count", input: { from: "$a" } },
        { id: "bad1", op: "nodes.descendants", input: { from: "$links" } },
        { id: "bad2", op: "nodes.descendants", input: { from: "$byLabel" } },
        { id: "ok", op: "nodes.descendants", input: { from: "$n" } },
      ],
    });
    expect(issues.map((i) => i.stepId)).toEqual(["bad1", "bad2"]);
    expect(issues[0]?.message).toBe(
      "input.from references '$links', which holds edges, but this field expects nodes.",
    );
    expect(issues[0]?.hint).toBe("Reference a step that returns nodes.");
    expect(issues[1]?.message).toBe(
      "input.from references '$byLabel', but its grouped-count result has no entities to reference.",
    );
  });

  it("rejects an untargeted reference to a result with no entities", () => {
    const [issue] = issuesOf({
      steps: [
        { id: "a", op: "nodes.find" },
        { id: "g", op: "nodes.countBy", input: { from: "$a", field: "label" } },
        { id: "s", op: "selection.select", input: { refs: ["$g"] } },
      ],
    });
    expect(issue?.code).toBe("ref.type_mismatch");
    expect(issue?.hint).toBe("Reference a step that returns a collection.");
  });

  it("resolves references against stored session results", () => {
    const session: SessionView = {
      has: (id) => id === "owned" || id === "counts",
      ids: () => ["owned", "counts"],
      typeOf: (id) => (id === "owned" ? "nodes" : undefined),
      countOf: (id) => (id === "owned" ? 3 : undefined),
    };
    const ok = stepsOf(
      { steps: [{ id: "x", op: "nodes.descendants", input: { from: "$owned[3]" } }] },
      { session },
    );
    expect(ok.steps[0]?.refs[0]?.source).toBe("session");
    expect(ok.steps[0]?.dependencies).toEqual([]);
    expect(ok.levels.map((l) => l.map((s) => s.id))).toEqual([["x"]]);

    const issues = issuesOf(
      {
        steps: [
          { id: "x", op: "nodes.descendants", input: { from: "$owned[4]" } },
          { id: "y", op: "nodes.descendants", input: { from: "$counts" } },
          { id: "z", op: "nodes.descendants", input: { from: "$ownd" } },
        ],
      },
      { session },
    );
    expect(issues.map((i) => i.code)).toEqual([
      "ref.ordinal_out_of_range",
      "ref.type_mismatch",
      "ref.unknown_target",
    ]);
    expect(issues[0]?.message).toBe(
      "input.from: '$owned[4]' asks for position 4, but 'owned' holds 3 item(s).",
    );
    expect(issues[0]?.hint).toBe("Use a position between 1 and 3.");
    expect(issues[1]?.message).toBe(
      "input.from references '$counts', but that stored result has no entities to reference.",
    );
    expect(issues[2]?.hint).toBe("Did you mean '$owned'?");
  });

  it("skips the ordinal check when the session cannot report a count", () => {
    const session: SessionView = {
      has: () => true,
      ids: () => ["owned"],
      typeOf: () => "nodes",
      countOf: () => undefined,
    };
    expect(
      issuesOf(
        { steps: [{ id: "x", op: "nodes.descendants", input: { from: "$owned[99]" } }] },
        { session },
      ),
    ).toEqual([]);
  });

  it("prefers a step in this plan over a stored result with the same name", () => {
    const session: SessionView = {
      has: () => true,
      ids: () => ["a"],
      typeOf: () => "edges",
      countOf: () => 1,
    };
    const plan = stepsOf(
      {
        steps: [
          { id: "a", op: "nodes.find" },
          { id: "b", op: "nodes.descendants", input: { from: "$a" } },
        ],
      },
      { session },
    );
    expect(plan.steps[1]?.refs[0]?.source).toBe("plan");
  });
});
