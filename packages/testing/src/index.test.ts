import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collection, createRegistry, defineOperation, z } from "weftai";
import {
  createTestRuntime,
  formatSnapshot,
  loadFixture,
  toHaveFailed,
  toHaveMatched,
  toHaveNotice,
} from "./index.js";

const Item = z.object({ id: z.string(), label: z.string() });
const Items = collection("items", Item, {
  label: (item) => item.label,
  key: (item) => item.id,
});

const find = defineOperation({
  name: "items.find",
  description: "Find items.",
  input: z.object({}),
  output: Items,
  run: ({ notice }) => {
    notice("loaded fixture");
    return [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
    ];
  },
});

const boom = defineOperation({
  name: "items.boom",
  description: "Fail.",
  input: z.object({}),
  output: Items,
  run: () => {
    throw new Error("no such field 'kind'");
  },
});

const registry = createRegistry({ operations: [find, boom] });

describe("@weftai/testing", () => {
  it("runs a plan and exposes model-facing text", async () => {
    const test = createTestRuntime(registry, {});
    const result = await test.runSteps([{ id: "all", op: "items.find" }]);
    toHaveMatched(result, "all", 2);
    toHaveNotice(result, "all", "loaded fixture");
    expect(formatSnapshot(result)).toContain("all (items): 2 matched");
    expect(formatSnapshot(result)).toContain("1. Alpha");
  });

  it("asserts a failed step by message", async () => {
    const test = createTestRuntime(registry, {});
    const result = await test.runSteps([{ id: "x", op: "items.boom" }]);
    toHaveFailed(result, "x", "no such field");
  });

  it("loads a JSON fixture from disk", () => {
    const data = loadFixture<{ steps: unknown[] }>(
      fileURLToPath(
        new URL("../../../examples/supply-chain/plans/taiwan-components.json", import.meta.url),
      ),
    );
    expect(data.steps).toHaveLength(3);
  });
});
