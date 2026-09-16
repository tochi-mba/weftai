import { describe, expect, it } from "vitest";
import { collection, createRegistry, defineOperation, z } from "weftai";
import { createTestRuntime } from "./index.js";
import "./matchers.js";

const Item = z.object({ id: z.string(), label: z.string() });
const Items = collection("items", Item, { label: (item) => item.label, key: (item) => item.id });

const registry = createRegistry({
  operations: [
    defineOperation({
      name: "items.find",
      description: "Find.",
      input: z.object({}),
      output: Items,
      run: ({ notice }) => {
        notice("two loaded");
        return [
          { id: "a", label: "Alpha" },
          { id: "b", label: "Beta" },
        ];
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

describe("vitest matchers", () => {
  const test = createTestRuntime(registry, {});

  it("toHaveMatched passes on the count and fails with the actual count", async () => {
    const result = await test.runSteps([{ id: "all", op: "items.find" }]);
    expect(result).toHaveMatched("all", 2);
    expect(result).not.toHaveMatched("all", 3);
    expect(() => expect(result).toHaveMatched("all", 3)).toThrow(/to have matched 3, got 2/);
    expect(() => expect(result).not.toHaveMatched("all", 2)).toThrow(/not to have matched 2/);
  });

  it("toHaveNotice matches strings and patterns", async () => {
    const result = await test.runSteps([{ id: "all", op: "items.find" }]);
    expect(result).toHaveNotice("all", "two loaded");
    expect(result).toHaveNotice("all", /loaded$/);
    expect(result).not.toHaveNotice("all", "nothing");
    expect(() => expect(result).toHaveNotice("all", "nothing")).toThrow(/Notices: two loaded/);
  });

  it("toHaveFailed checks status and message", async () => {
    const result = await test.runSteps([{ id: "x", op: "items.boom" }]);
    expect(result).toHaveFailed("x", "kaboom");
    expect(result).toHaveFailed("x", /kaboom/);
    expect(result).not.toHaveFailed("x", "other");
    expect(() => expect(result).toHaveFailed("x", "other")).toThrow(/status=error/);
    const ok = await test.runSteps([{ id: "all", op: "items.find" }]);
    expect(() => expect(ok).toHaveFailed("all", "kaboom")).toThrow(/status=ok/);
  });

  it("names the known steps when the id is missing", async () => {
    const result = await test.runSteps([{ id: "all", op: "items.find" }]);
    expect(() => expect(result).toHaveMatched("nope", 1)).toThrow(
      "No step 'nope' in the result. Steps: all.",
    );
  });
});
