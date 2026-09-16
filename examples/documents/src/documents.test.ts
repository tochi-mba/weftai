import { describe, expect, it } from "vitest";
import { createDocumentsRuntime } from "./domain.js";

describe("documents domain", () => {
  it("searches contracts by title", async () => {
    const { runtime, ctx } = createDocumentsRuntime();
    const result = await runtime.execute(
      {
        steps: [
          {
            id: "msa",
            op: "contracts.search",
            input: { filters: [{ field: "title", op: "contains", value: "MSA" }] },
          },
        ],
      },
      { ctx },
    );
    expect(result.ok).toBe(true);
    expect(result.steps[0]?.count).toBe(2);
    expect(result.text).toBe("msa (contracts): 2 matched\n  1. Acme MSA\n  2. Delta MSA");
    expect(result.text).not.toContain("c1");
  });

  it("finds contracts expiring within 30 days", async () => {
    const { runtime, ctx } = createDocumentsRuntime();
    const result = await runtime.execute(
      { steps: [{ id: "soon", op: "contracts.expiringWithin", input: { withinDays: 30 } }] },
      { ctx },
    );
    expect(result.steps[0]?.items?.map((c) => (c as { title: string }).title)).toEqual([
      "Acme MSA",
      "Gamma SOW",
    ]);
    expect(result.text).toContain("soon (contracts): 2 matched");
  });

  it("groups contracts by owner", async () => {
    const { runtime, ctx } = createDocumentsRuntime();
    const result = await runtime.execute(
      {
        steps: [
          { id: "all", op: "contracts.search" },
          { id: "by", op: "contracts.countBy", input: { from: "$all", field: "owner" } },
        ],
      },
      { ctx },
    );
    expect(result.steps[1]?.data).toEqual([
      { key: "legal", count: 2 },
      { key: "ops", count: 2 },
    ]);
    expect(result.text).toContain("by (contracts): 4 matched\n  legal: 2\n  ops: 2");
  });

  it("treats a missing field as an error, not an empty result", async () => {
    const { runtime, ctx } = createDocumentsRuntime();
    const result = await runtime.execute(
      {
        steps: [
          {
            id: "bad",
            op: "contracts.search",
            input: { filters: [{ field: "jurisdiction", op: "eq", value: "Delaware" }] },
          },
        ],
      },
      { ctx },
    );
    expect(result.ok).toBe(false);
    expect(result.text).toContain("Unknown field 'jurisdiction' on contracts.");
    expect(result.text).toContain("Available fields: title, owner, expiresOn.");
    expect(result.steps[0]?.count).toBeUndefined();
  });
});
