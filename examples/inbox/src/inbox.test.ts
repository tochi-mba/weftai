import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createInboxRuntime, loadContext, registry } from "./domain.js";
import { NOW, tickets } from "./fixture.js";
import { parseInstant, waitingSince } from "./operations.js";

describe("inbox domain", () => {
  it("lists the operations a model can use", () => {
    expect(registry.names()).toEqual([
      "tickets.search",
      "tickets.waiting",
      "tickets.messages",
      "tickets.assign",
      "tickets.filter",
      "tickets.count",
      "tickets.countBy",
      "tickets.distinct",
      "tickets.mostCommon",
      "tickets.first",
      "tickets.pick",
      "tickets.details",
      "messages.filter",
      "messages.count",
      "messages.countBy",
      "messages.first",
      "messages.pick",
    ]);
  });

  it("searches tickets by customer, tolerating casing, and never prints ids", async () => {
    const { runtime, ctx } = createInboxRuntime();
    const result = await runtime.execute(
      {
        steps: [
          {
            id: "acme",
            op: "tickets.search",
            input: { filters: [{ field: "customer", op: "fuzzy", value: "acme" }] },
          },
        ],
      },
      { ctx },
    );
    expect(result.ok).toBe(true);
    expect(result.text).toBe(
      "acme (tickets): 2 matched\n  1. Refund for duplicate charge\n  2. Cannot export report to CSV",
    );
    expect(result.text).not.toMatch(/\bt[1-5]\b/);
  });

  it("lists tickets whose customer has waited longer than N hours, longest wait first", async () => {
    const { runtime, ctx } = createInboxRuntime();
    const day = await runtime.execute(
      { steps: [{ id: "day", op: "tickets.waiting", input: { hours: 24 } }] },
      { ctx },
    );
    expect(day.text).toBe("day (tickets): 1 matched\n  1. Cannot export report to CSV");
    const half = await runtime.execute(
      { steps: [{ id: "half", op: "tickets.waiting", input: { hours: 12 } }] },
      { ctx },
    );
    expect(half.text).toBe(
      [
        "half (tickets): 3 matched",
        "  1. Cannot export report to CSV",
        "  2. Refund for duplicate charge",
        "  3. Invoice shows wrong VAT rate",
      ].join("\n"),
    );
    const later = await runtime.execute(
      {
        steps: [
          { id: "none", op: "tickets.waiting", input: { hours: 0, asOf: "2026-09-11T08:00:00Z" } },
        ],
      },
      { ctx },
    );
    expect(later.text).toBe("none (tickets): 0 matched");
  });

  it("reads the messages of a customer's tickets and narrows them by body", async () => {
    const { runtime, ctx } = createInboxRuntime();
    const result = await runtime.execute(
      {
        steps: [
          {
            id: "acme",
            op: "tickets.search",
            input: { filters: [{ field: "customer", value: "Acme Corp" }] },
          },
          { id: "thread", op: "tickets.messages", input: { from: "$acme" } },
          {
            id: "refunds",
            op: "messages.filter",
            input: {
              from: "$thread",
              filters: [{ field: "text", op: "contains", value: "refund" }],
            },
          },
        ],
      },
      { ctx },
    );
    expect(result.steps.map((s) => s.count)).toEqual([2, 4, 2]);
    expect(result.text).toContain(
      [
        "refunds (messages): 2 matched",
        "  1. Dana Whitfield: We were charged twice for September. Please refund the duplicate.",
        "  2. Dana Whitfield: Any update on the refund? Finance needs it before month end.",
      ].join("\n"),
    );
  });

  it("groups tickets by priority, most common first", async () => {
    const { runtime, ctx } = createInboxRuntime();
    const result = await runtime.execute(
      {
        steps: [
          { id: "all", op: "tickets.search" },
          { id: "by", op: "tickets.countBy", input: { from: "$all", field: "priority" } },
        ],
      },
      { ctx },
    );
    expect(result.text).toContain(
      "by (tickets): 5 matched\n  high: 2\n  low: 1\n  normal: 1\n  urgent: 1",
    );
  });

  it("assigns waiting tickets in a second call and records the assignment", async () => {
    const { runtime, ctx } = createInboxRuntime();
    const session = { id: "triage" };
    await runtime.execute(
      { steps: [{ id: "waiting", op: "tickets.waiting", input: { hours: 12 } }] },
      { ctx, session },
    );
    const assigned = await runtime.execute(
      {
        steps: [
          {
            id: "mine",
            op: "tickets.assign",
            input: { refs: ["$waiting[1,3]"], assignee: "Priya" },
          },
          { id: "info", op: "tickets.details", input: { from: "$mine", fields: ["assignee"] } },
        ],
      },
      { ctx, session },
    );
    expect(assigned.ok).toBe(true);
    expect(ctx.assignments).toEqual({ t2: "Priya", t3: "Priya" });
    expect(assigned.text).toContain("  1. Cannot export report to CSV - assignee: Priya");
    const readOnly = await runtime.execute(
      {
        steps: [
          { id: "x", op: "tickets.assign", input: { refs: ["$waiting"], assignee: "Priya" } },
        ],
      },
      { ctx, session, allowWrites: false },
    );
    expect(readOnly.issues?.[0]?.code).toBe("step.write_not_allowed");
  });

  it("shows every field of a ticket with absent values as not recorded", async () => {
    const { runtime, ctx } = createInboxRuntime();
    const result = await runtime.execute(
      {
        steps: [
          {
            id: "first",
            op: "tickets.search",
            input: { filters: [{ field: "title", op: "startsWith", value: "Refund" }] },
          },
          { id: "info", op: "tickets.details", input: { from: "$first" } },
        ],
      },
      { ctx },
    );
    expect(result.text).toContain(
      "  1. Refund for duplicate charge - customer: Acme Corp; priority: high; status: open; assignee: not recorded; tags: billing, refund",
    );
  });

  it("treats a missing field as an error, not an empty result", async () => {
    const { runtime, ctx } = createInboxRuntime();
    const result = await runtime.execute(
      {
        steps: [
          {
            id: "bad",
            op: "tickets.search",
            input: { filters: [{ field: "region", op: "eq", value: "EU" }] },
          },
        ],
      },
      { ctx },
    );
    expect(result.ok).toBe(false);
    expect(result.text).toBe(
      "bad: failed\n  Unknown field 'region' on tickets. Available fields: subject, customer, priority, status, assignee, tags.",
    );
  });

  it("rejects a negative window at validation time and a malformed timestamp at run time", async () => {
    const { runtime, ctx } = createInboxRuntime();
    const negative = await runtime.execute(
      { steps: [{ id: "bad", op: "tickets.waiting", input: { hours: -1 } }] },
      { ctx },
    );
    expect(negative.issues?.[0]?.code).toBe("step.invalid_input");
    const malformed = await runtime.execute(
      { steps: [{ id: "bad", op: "tickets.waiting", input: { hours: 1, asOf: "next week" } }] },
      { ctx },
    );
    expect(malformed.steps[0]?.error).toBe(
      "Step 'bad' failed while running 'tickets.waiting': 'next week' is not an ISO timestamp.",
    );
  });

  it("knows when a customer started waiting", () => {
    const [refund, csv, , darkMode] = tickets;
    if (refund === undefined || csv === undefined || darkMode === undefined) {
      throw new Error("missing fixture ticket");
    }
    expect(waitingSince(refund)).toBe(parseInstant("2026-09-14T16:00:00Z"));
    expect(waitingSince(csv)).toBe(parseInstant("2026-09-11T09:00:00Z"));
    expect(waitingSince(darkMode)).toBeUndefined();
    expect(() => parseInstant("nope")).toThrow("'nope' is not an ISO timestamp.");
  });

  it("loads a fixture file with its own notion of now", () => {
    const path = fileURLToPath(new URL("./fixture.json", import.meta.url));
    const loaded = loadContext(path);
    expect(loaded.tickets).toHaveLength(5);
    expect(loaded.messages).toHaveLength(9);
    expect(loaded.now).toBe(NOW);
    expect(loadContext().tickets).toBe(tickets);
  });
});
