import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { StepResult } from "../executor/types.js";
import { defineOperation } from "../operation.js";
import { createRegistry } from "../registry.js";
import { collection, groups } from "../schema/types.js";
import { PREVIEW_NOTICE, renderStep, renderValidation } from "./step.js";

const Thing = z.object({ label: z.string() });
const Things = collection("things", Thing, { label: (t) => t.label });
const registry = createRegistry({
  operations: [
    defineOperation({
      name: "things.find",
      description: "Find.",
      input: z.object({}),
      output: Things,
      run: () => [],
    }),
    defineOperation({
      name: "things.by",
      description: "By.",
      input: z.object({}),
      output: groups(),
      run: () => [],
    }),
  ],
});

function step(
  partial: Partial<StepResult> & Pick<StepResult, "id" | "operation" | "status">,
): StepResult {
  return {
    kind: undefined,
    type: undefined,
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
    ...partial,
  };
}

const args = { registry, ctx: {} };

describe("renderStep", () => {
  it("renders a preview notice text that names the step", () => {
    expect(PREVIEW_NOTICE("owned")).toBe(
      "[intermediate step - preview only; reference $owned to use the full set]",
    );
  });

  it("falls back to a generic message for an error or skip without a reason", () => {
    expect(renderStep(step({ id: "a", operation: "things.find", status: "error" }), args)).toEqual({
      header: "a: failed",
      lines: ["  The step failed."],
      notices: [],
    });
    expect(
      renderStep(step({ id: "a", operation: "things.find", status: "skipped" }), args),
    ).toEqual({
      header: "a: skipped",
      lines: ["  Skipped."],
      notices: [],
    });
  });

  it("indents multi-line error messages", () => {
    const rendered = renderStep(
      step({ id: "a", operation: "things.find", status: "error", error: "line one\nline two" }),
      args,
    );
    expect(rendered.lines).toEqual(["  line one", "  line two"]);
  });

  it("keeps notices on failed steps", () => {
    const rendered = renderStep(
      step({
        id: "a",
        operation: "things.find",
        status: "error",
        error: "x",
        notices: ["partial"],
      }),
      args,
    );
    expect(rendered.notices).toEqual(["partial"]);
  });

  it("counts items when the count is missing", () => {
    const rendered = renderStep(
      step({
        id: "a",
        operation: "things.find",
        status: "ok",
        kind: "collection",
        items: [{ label: "A" }],
      }),
      args,
    );
    expect(rendered.header).toBe("a (items): 1 matched");
  });

  it("renders unexpected group rows without throwing", () => {
    const rendered = renderStep(
      step({
        id: "g",
        operation: "things.by",
        status: "ok",
        kind: "groups",
        data: ["odd", { key: "k", count: "2" }],
      }),
      args,
    );
    expect(rendered.header).toBe("g (groups): 2 groups");
    expect(rendered.lines).toEqual(["  odd: 0", "  k: 2"]);
  });

  it("renders a groups step whose data is not an array as empty", () => {
    const rendered = renderStep(
      step({ id: "g", operation: "things.by", status: "ok", kind: "groups", data: "nope" }),
      args,
    );
    expect(rendered.header).toBe("g (groups): 0 groups");
    expect(rendered.lines).toEqual([]);
  });

  it("labels object items without a label field as JSON", () => {
    const rendered = renderStep(
      step({
        id: "m",
        operation: "unknown.op",
        status: "ok",
        kind: "collection",
        type: "rows",
        count: 1,
        items: [{ a: 1 }],
      }),
      args,
    );
    expect(rendered.lines).toEqual(['  1. {"a":1}']);
  });
});

describe("renderValidation", () => {
  it("formats issues one per line", () => {
    expect(
      renderValidation([
        { code: "plan.too_many_steps", message: "Too many." },
        { code: "step.invalid_id", stepId: "a", message: "Bad.", hint: "Fix." },
      ]),
    ).toBe("Too many.\nStep 'a': Bad. Fix.");
  });
});
