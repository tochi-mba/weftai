/**
 * The thirteen worked examples from the Jigsaw proposal (Appendix A), each as one plan against the
 * proposal's test diagram. These assert the exact model-facing text, so they are the acceptance
 * bar for the framework: if a rendering rule changes, one of these fails.
 */

import { describe, expect, it } from "vitest";
import { createFormatter } from "weftai";
import { createDiagramRuntime } from "./domain.js";
import { chainDiagram, ids, largeDiagram, withDuplicateSub3 } from "./fixture.js";

const byLabel = (id: string, value: string, op = "fuzzy") => ({
  id,
  op: "nodes.find",
  input: { filters: [{ field: "label", op, value }] },
});

const PREVIEW = (id: string) =>
  `  [intermediate step - preview only; reference $${id} to use the full set]`;

describe("diagram parity with the proposal", () => {
  it("01 counts the Corporate entities", async () => {
    const { runtime, ctx } = createDiagramRuntime();
    const result = await runtime.execute(
      {
        steps: [
          {
            id: "corporates",
            op: "nodes.find",
            input: { filters: [{ field: "entityType", op: "eq", value: "Corporate" }] },
          },
          { id: "n", op: "nodes.count", input: { from: "$corporates" } },
        ],
      },
      { ctx },
    );
    expect(result.ok).toBe(true);
    expect(result.steps.map((s) => s.count)).toEqual([4, 4]);
    expect(result.text).toContain("n (nodes): 4 matched\n  4");
  });

  it("02 groups entities by jurisdiction, most common first, unset last", async () => {
    const { runtime, ctx } = createDiagramRuntime();
    const result = await runtime.execute(
      {
        steps: [
          { id: "all", op: "nodes.find" },
          {
            id: "byJurisdiction",
            op: "nodes.countBy",
            input: { from: "$all", field: "Jurisdiction" },
          },
        ],
      },
      { ctx },
    );
    expect(result.text).toContain(
      [
        "byJurisdiction (nodes): 6 matched",
        "  Delaware: 2",
        "  Cayman Islands: 1",
        "  United Kingdom: 1",
        "  not recorded: 2",
      ].join("\n"),
    );
  });

  it("03 tells everything about Corporate 1 in one call, tolerating casing", async () => {
    const { runtime, ctx } = createDiagramRuntime();
    const result = await runtime.execute(
      {
        steps: [
          byLabel("match", "corporate 1"),
          { id: "info", op: "nodes.details", input: { from: "$match" } },
        ],
      },
      { ctx },
    );
    expect(result.text).toBe(
      [
        "match (nodes): 1 matched",
        "  1. Corporate 1",
        PREVIEW("match"),
        "info (nodes): 1 matched",
        "  1. Corporate 1 - entityType: Corporate; Jurisdiction: Cayman Islands",
      ].join("\n"),
    );
  });

  it("04 selects everything Corporate 1 owns across two calls with one word, not three UUIDs", async () => {
    const { runtime, ctx } = createDiagramRuntime();
    const session = { id: "flagship" };
    const first = await runtime.execute(
      {
        steps: [
          byLabel("acme", "Corporate 1"),
          { id: "owned", op: "nodes.descendants", input: { from: "$acme", depth: "all" } },
        ],
      },
      { ctx, session },
    );
    expect(first.text).toBe(
      [
        "acme (nodes): 1 matched",
        "  1. Corporate 1",
        PREVIEW("acme"),
        "owned (nodes): 3 matched",
        "  1. Sub 1 Ltd",
        "  2. Sub 2 Ltd",
        "  3. Sub 3 Ltd",
      ].join("\n"),
    );
    expect(first.text).not.toContain("Trust A");

    const second = await runtime.execute(
      { steps: [{ id: "selected", op: "selection.select", input: { refs: ["$owned"] } }] },
      { ctx, session },
    );
    expect(second.text).toBe(
      "selected (nodes): 3 matched\n  1. Sub 1 Ltd\n  2. Sub 2 Ltd\n  3. Sub 3 Ltd",
    );
    expect(ctx.selected).toEqual([ids.sub1, ids.sub2, ids.sub3]);
  });

  it("05 narrows Corporate 1's subsidiaries to Delaware in one call with zero identifiers", async () => {
    const { runtime, ctx } = createDiagramRuntime();
    const result = await runtime.execute(
      {
        steps: [
          byLabel("acme", "Corporate 1"),
          { id: "owned", op: "nodes.descendants", input: { from: "$acme", depth: "all" } },
          {
            id: "delaware",
            op: "nodes.filter",
            input: {
              from: "$owned",
              filters: [{ field: "Jurisdiction", op: "eq", value: "Delaware" }],
            },
          },
        ],
      },
      { ctx },
    );
    expect(result.steps.map((s) => s.count)).toEqual([1, 3, 2]);
    expect(result.text).toContain("owned (nodes): 3 matched");
    expect(result.text).toContain("delaware (nodes): 2 matched\n  1. Sub 2 Ltd\n  2. Sub 3 Ltd");
    expect(result.text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it("06 finds indirect ownership with the same percentage arithmetic: 100% × 50% = 50%", async () => {
    const { runtime, ctx } = createDiagramRuntime();
    const result = await runtime.execute(
      {
        steps: [
          byLabel("from", "Corporate 1"),
          byLabel("to", "Sub 3 Ltd"),
          { id: "rel", op: "graph.paths", input: { from: "$from", to: "$to" } },
        ],
      },
      { ctx },
    );
    expect(result.text).toContain("from (nodes): 1 matched");
    expect(result.text).toContain("to (nodes): 1 matched");
    expect(result.text).toContain(
      "rel (paths): 1 matched\n  1. Corporate 1 indirectly owns 50% of Sub 3 Ltd (2 hops)",
    );
  });

  it("07 finds the ultimate beneficial owner, and all owners at depth all", async () => {
    const { runtime, ctx } = createDiagramRuntime();
    const ubo = await runtime.execute(
      {
        steps: [
          byLabel("target", "Sub 3 Ltd"),
          { id: "ubo", op: "nodes.ancestors", input: { from: "$target", depth: "ultimate" } },
        ],
      },
      { ctx },
    );
    expect(ubo.text).toContain("ubo (nodes): 1 matched\n  1. Jonah Smith");

    const all = await runtime.execute(
      {
        steps: [
          byLabel("target", "Sub 3 Ltd"),
          { id: "owners", op: "nodes.ancestors", input: { from: "$target", depth: "all" } },
        ],
      },
      { ctx },
    );
    expect(all.text).toContain(
      "owners (nodes): 3 matched\n  1. Sub 1 Ltd\n  2. Corporate 1\n  3. Jonah Smith",
    );
  });

  it("08 lists the relationships of Sub 1 Ltd with endpoint labels", async () => {
    const { runtime, ctx } = createDiagramRuntime();
    const result = await runtime.execute(
      {
        steps: [
          byLabel("sub", "Sub 1 Ltd", "eq"),
          { id: "links", op: "edges.find", input: { involving: "$sub" } },
        ],
      },
      { ctx },
    );
    expect(result.text).toContain(
      [
        "links (edges): 2 matched",
        "  1. Corporate 1 to Sub 1 Ltd (Ownership 100%)",
        "  2. Sub 1 Ltd to Sub 3 Ltd (Ownership 50%)",
      ].join("\n"),
    );
  });

  it("09 resolves percentage and its synonyms to the ownership label", async () => {
    const { runtime, ctx } = createDiagramRuntime();
    for (const field of [
      "percentage",
      "ownership",
      "ownershipPercentage",
      "share",
      "percent",
      "label",
    ]) {
      const result = await runtime.execute(
        {
          steps: [
            {
              id: "half",
              op: "edges.find",
              input: { filters: [{ field, op: "eq", value: "50%" }] },
            },
          ],
        },
        { ctx, session: { id: field } },
      );
      expect(result.text, field).toBe(
        "half (edges): 1 matched\n  1. Sub 1 Ltd to Sub 3 Ltd (Ownership 50%)",
      );
    }
  });

  it("10 disambiguates two entities with the same label by ordinal", async () => {
    const { runtime, ctx } = createDiagramRuntime(withDuplicateSub3());
    const session = { id: "dup" };
    const first = await runtime.execute(
      {
        steps: [
          byLabel("found", "Sub 3 Ltd"),
          {
            id: "matches",
            op: "nodes.details",
            input: { from: "$found", fields: ["Jurisdiction"] },
          },
        ],
      },
      { ctx, session },
    );
    expect(first.text).toContain(
      [
        "matches (nodes): 2 matched",
        "  1. Sub 3 Ltd - Jurisdiction: Delaware",
        "  2. Sub 3 Ltd - Jurisdiction: not recorded",
      ].join("\n"),
    );
    const second = await runtime.execute(
      { steps: [{ id: "sel", op: "selection.select", input: { refs: ["$matches[2]"] } }] },
      { ctx, session },
    );
    expect(second.ok).toBe(true);
    expect(ctx.selected).toEqual([ids.sub3Duplicate]);
  });

  it("11 turns an edge field used on nodes into an actionable error, not an empty result", async () => {
    const { runtime, ctx } = createDiagramRuntime();
    const result = await runtime.execute(
      {
        steps: [
          {
            id: "x",
            op: "nodes.find",
            input: { filters: [{ field: "relationshipType", op: "eq", value: "Ownership" }] },
          },
        ],
      },
      { ctx },
    );
    expect(result.ok).toBe(false);
    expect(result.steps[0]?.status).toBe("error");
    expect(result.text).toBe(
      "x: failed\n  Unknown field 'relationshipType' on nodes. Available fields: label, entityType, Jurisdiction.",
    );
  });

  it("12 lists 35 entities showing 30 of 35 while $all[35] still resolves in a later call", async () => {
    const { runtime, ctx } = createDiagramRuntime(largeDiagram(29), {
      formatter: createFormatter({
        budgets: { read: 31, preview: 31, total: 10_000 },
        estimateTokens: () => 1,
      }),
    });
    const session = { id: "big" };
    const listing = await runtime.execute(
      { steps: [{ id: "all", op: "nodes.find" }] },
      { ctx, session },
    );
    expect(listing.steps[0]?.count).toBe(35);
    expect(listing.text).toContain("all (nodes): 35 matched");
    expect(listing.text).toContain("  30. Entity 24");
    expect(listing.text).not.toContain("  31. ");
    expect(listing.text).toContain("  showing 30 of 35");

    const last = await runtime.execute(
      { steps: [{ id: "last", op: "nodes.pick", input: { from: "$all", ordinals: [35] } }] },
      { ctx, session },
    );
    expect(last.text).toBe("last (nodes): 1 matched\n  1. Entity 29");
  });

  it("13 relates two sets across every edge type, and reports a depth cap instead of 'unrelated'", async () => {
    const { runtime, ctx } = createDiagramRuntime();
    const result = await runtime.execute(
      {
        steps: [
          {
            id: "corps",
            op: "nodes.find",
            input: { filters: [{ field: "entityType", value: "Corporate" }] },
          },
          {
            id: "trusts",
            op: "nodes.find",
            input: { filters: [{ field: "type", value: "Trust" }] },
          },
          { id: "rel", op: "graph.paths", input: { from: "$corps", to: "$trusts" } },
        ],
      },
      { ctx },
    );
    expect(result.text).toContain(
      "rel (paths): 1 matched\n  1. Corporate 1 has a direct cashflow to Trust A (direct)",
    );

    const deep = createDiagramRuntime(chainDiagram(10));
    const capped = await deep.runtime.execute(
      {
        steps: [
          byLabel("start", "Chain 0", "eq"),
          byLabel("end", "Chain 10", "eq"),
          { id: "rel", op: "graph.paths", input: { from: "$start", to: "$end" } },
        ],
      },
      { ctx: deep.ctx },
    );
    expect(capped.text).toContain("rel (paths): 0 matched");
    expect(capped.text).toContain(
      "  Search stopped at 8 hops between Chain 0 and Chain 10; longer routes may exist.",
    );
  });

  it("never prints an internal identifier in any scenario", async () => {
    const { runtime, ctx } = createDiagramRuntime();
    const result = await runtime.execute(
      {
        steps: [
          { id: "all", op: "nodes.find" },
          { id: "edges", op: "edges.find" },
          { id: "info", op: "nodes.details", input: { from: "$all" } },
          { id: "rel", op: "graph.paths", input: { from: "$all", to: "$all" } },
        ],
      },
      { ctx },
    );
    expect(result.text).not.toMatch(/1111|2222|3333|4444|5555|6666/);
    expect(result.text).not.toMatch(/\be[1-5]\b/);
  });
});
