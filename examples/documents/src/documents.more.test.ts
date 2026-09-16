import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createDocumentsRuntime, loadContext, registry } from "./domain.js";
import { fixture, NOW } from "./fixture.js";

describe("documents domain: more scenarios", () => {
  it("lists the operations a model can use", () => {
    expect(registry.names()).toEqual([
      "contracts.search",
      "contracts.expiringWithin",
      "contracts.filter",
      "contracts.count",
      "contracts.countBy",
      "contracts.distinct",
      "contracts.mostCommon",
      "contracts.first",
      "contracts.pick",
      "contracts.details",
    ]);
  });

  it("uses an explicit asOf date and a zero-day window", async () => {
    const { runtime, ctx } = createDocumentsRuntime();
    const exact = await runtime.execute(
      {
        steps: [
          {
            id: "today",
            op: "contracts.expiringWithin",
            input: { withinDays: 0, asOf: "2026-10-01" },
          },
        ],
      },
      { ctx },
    );
    expect(exact.text).toBe("today (contracts): 1 matched\n  1. Acme MSA");
    const none = await runtime.execute(
      {
        steps: [
          {
            id: "none",
            op: "contracts.expiringWithin",
            input: { withinDays: 1, asOf: "2030-01-01" },
          },
        ],
      },
      { ctx },
    );
    expect(none.text).toBe("none (contracts): 0 matched");
  });

  it("rejects a malformed date with a sentence naming the format", async () => {
    const { runtime, ctx } = createDocumentsRuntime();
    const result = await runtime.execute(
      {
        steps: [
          {
            id: "bad",
            op: "contracts.expiringWithin",
            input: { withinDays: 3, asOf: "next week" },
          },
        ],
      },
      { ctx },
    );
    expect(result.steps[0]?.error).toBe(
      "Step 'bad' failed while running 'contracts.expiringWithin': 'next week' is not an ISO date (YYYY-MM-DD).",
    );
  });

  it("rejects a negative window at validation time", async () => {
    const { runtime, ctx } = createDocumentsRuntime();
    const result = await runtime.execute(
      { steps: [{ id: "bad", op: "contracts.expiringWithin", input: { withinDays: -1 } }] },
      { ctx },
    );
    expect(result.issues?.[0]?.code).toBe("step.invalid_input");
  });

  it("composes search, filter by alias, details and count in one call", async () => {
    const { runtime, ctx } = createDocumentsRuntime();
    const result = await runtime.execute(
      {
        steps: [
          { id: "all", op: "contracts.search" },
          {
            id: "ops",
            op: "contracts.filter",
            input: { from: "$all", filters: [{ field: "owner", value: "ops" }] },
          },
          { id: "info", op: "contracts.details", input: { from: "$ops" } },
          { id: "n", op: "contracts.count", input: { from: "$ops" } },
          { id: "soonest", op: "contracts.first", input: { from: "$ops" } },
        ],
      },
      { ctx },
    );
    expect(result.ok).toBe(true);
    expect(result.text).toContain("info (contracts): 2 matched");
    expect(result.text).toContain("  1. Gamma SOW - owner: ops; expiresOn: 2026-09-20");
    expect(result.text).toContain("n (contracts): 2 matched\n  2");
    expect(result.text).toContain("soonest (contracts): 1 matched\n  1. Gamma SOW");
    expect(result.text).not.toMatch(/\bc[1-4]\b/);
  });

  it("filters expiry with ordering operators on ISO dates", async () => {
    const { runtime, ctx } = createDocumentsRuntime();
    const result = await runtime.execute(
      {
        steps: [
          { id: "all", op: "contracts.search" },
          {
            id: "later",
            op: "contracts.filter",
            input: { from: "$all", filters: [{ field: "expiry", op: "gte", value: "2026-12-01" }] },
          },
        ],
      },
      { ctx },
    );
    expect(result.steps[1]?.items?.map((c) => (c as { title: string }).title)).toEqual([
      "Beta NDA",
      "Delta MSA",
    ]);
  });

  it("loads a fixture file with its own notion of today", () => {
    const path = fileURLToPath(new URL("./fixture.json", import.meta.url));
    const loaded = loadContext(path);
    expect(loaded.contracts.length).toBeGreaterThan(0);
    expect(typeof loaded.now).toBe("string");
    expect(loadContext().now).toBe(NOW);
    expect(loadContext().contracts).toBe(fixture);
  });
});
