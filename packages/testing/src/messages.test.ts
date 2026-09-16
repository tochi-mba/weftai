import { describe, expect, it } from "vitest";
import { collection, createRegistry, defineOperation, z } from "weftai";
import { createTestRuntime, toHaveFailed, toHaveMatched, toHaveNotice } from "./index.js";
import "./matchers.js";

const Items = collection("items", z.object({ label: z.string() }), { label: (i) => i.label });
const registry = createRegistry({
  operations: [
    defineOperation({
      name: "items.find",
      description: "Find.",
      input: z.object({}),
      output: Items,
      run: ({ notice }) => {
        notice("loaded fixture");
        return [{ label: "Alpha" }];
      },
    }),
    defineOperation({
      name: "items.boom",
      description: "Fail.",
      input: z.object({}),
      output: Items,
      run: () => {
        throw new Error("kaboom");
      },
    }),
  ],
});

describe("assertion messages on unusual steps", () => {
  const test = createTestRuntime(registry, {});

  it("says no count when the step failed", async () => {
    const result = await test.runSteps([{ id: "x", op: "items.boom" }]);
    expect(() => toHaveMatched(result, "x", 1)).toThrow(
      "Expected step 'x' to have matched 1, got no count.",
    );
    expect(() => expect(result).toHaveMatched("x", 1)).toThrow(/got no count/);
    expect(() => toHaveFailed(result, "x", /other/)).toThrow(/Error: Step 'x' failed/);
  });

  it("matches notices with a pattern", async () => {
    const result = await test.runSteps([{ id: "all", op: "items.find" }]);
    expect(() => toHaveNotice(result, "all", /fixture$/)).not.toThrow();
    expect(result).toHaveNotice("all", /fixture$/);
    expect(() => expect(result).not.toHaveNotice("all", "loaded")).toThrow(
      /not to have a notice matching loaded/,
    );
  });

  it("renders the negated failure message", async () => {
    const result = await test.runSteps([{ id: "x", op: "items.boom" }]);
    expect(() => expect(result).not.toHaveFailed("x", "kaboom")).toThrow(
      /not to fail matching kaboom/,
    );
  });

  it("says (none) when a step has no notices", async () => {
    const result = await test.runSteps([{ id: "x", op: "items.boom" }]);
    expect(() => expect(result).toHaveNotice("x", "anything")).toThrow(/Notices: \(none\)/);
  });
});
