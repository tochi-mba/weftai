/**
 * Thirteen worked scenarios, each as one plan against the sample bill of materials. These assert
 * the exact model-facing text, so they are the acceptance bar for the framework: if a rendering
 * rule changes, one of these fails.
 */

import { describe, expect, it } from "vitest";
import { createFormatter } from "weftai";
import { createSupplyChainRuntime } from "./domain.js";
import { chainCatalog, ids, largeCatalog, withDuplicateRegulator } from "./fixture.js";

const byLabel = (id: string, value: string, op = "fuzzy") => ({
  id,
  op: "parts.find",
  input: { filters: [{ field: "label", op, value }] },
});

const PREVIEW = (id: string) =>
  `  [intermediate step - preview only; reference $${id} to use the full set]`;

describe("supply-chain scenarios", () => {
  it("01 counts the components", async () => {
    const { runtime, ctx } = createSupplyChainRuntime();
    const result = await runtime.execute(
      {
        steps: [
          {
            id: "components",
            op: "parts.find",
            input: { filters: [{ field: "partType", op: "eq", value: "Component" }] },
          },
          { id: "n", op: "parts.count", input: { from: "$components" } },
        ],
      },
      { ctx },
    );
    expect(result.ok).toBe(true);
    expect(result.steps.map((s) => s.count)).toEqual([2, 2]);
    expect(result.text).toContain("n (parts): 2 matched\n  2");
  });

  it("02 groups parts by origin, most common first, unset last", async () => {
    const { runtime, ctx } = createSupplyChainRuntime();
    const result = await runtime.execute(
      {
        steps: [
          { id: "all", op: "parts.find" },
          { id: "byOrigin", op: "parts.countBy", input: { from: "$all", field: "origin" } },
        ],
      },
      { ctx },
    );
    expect(result.text).toContain(
      [
        "byOrigin (parts): 6 matched",
        "  Taiwan: 2",
        "  Germany: 1",
        "  Malaysia: 1",
        "  not recorded: 2",
      ].join("\n"),
    );
  });

  it("03 tells everything about the drone in one call, tolerating casing", async () => {
    const { runtime, ctx } = createSupplyChainRuntime();
    const result = await runtime.execute(
      {
        steps: [
          byLabel("match", "aurora drone"),
          { id: "info", op: "parts.details", input: { from: "$match" } },
        ],
      },
      { ctx },
    );
    expect(result.text).toBe(
      [
        "match (parts): 1 matched",
        "  1. Aurora Drone",
        PREVIEW("match"),
        "info (parts): 1 matched",
        "  1. Aurora Drone - partType: Assembly; origin: Germany",
      ].join("\n"),
    );
  });

  it("04 reserves everything the drone is built from across two calls with one word, not three ids", async () => {
    const { runtime, ctx } = createSupplyChainRuntime();
    const session = { id: "flagship" };
    const first = await runtime.execute(
      {
        steps: [
          byLabel("drone", "Aurora Drone"),
          { id: "components", op: "parts.components", input: { from: "$drone", depth: "all" } },
        ],
      },
      { ctx, session },
    );
    expect(first.text).toBe(
      [
        "drone (parts): 1 matched",
        "  1. Aurora Drone",
        PREVIEW("drone"),
        "components (parts): 3 matched",
        "  1. Power Module",
        "  2. Sensor Board",
        "  3. Voltage Regulator",
      ].join("\n"),
    );
    expect(first.text).not.toContain("Reflow Fixture");

    const second = await runtime.execute(
      { steps: [{ id: "reserved", op: "orders.reserve", input: { refs: ["$components"] } }] },
      { ctx, session },
    );
    expect(second.text).toBe(
      "reserved (parts): 3 matched\n  1. Power Module\n  2. Sensor Board\n  3. Voltage Regulator",
    );
    expect(ctx.reserved).toEqual([ids.power, ids.sensor, ids.regulator]);
  });

  it("05 narrows the drone's components to Taiwan in one call with zero identifiers", async () => {
    const { runtime, ctx } = createSupplyChainRuntime();
    const result = await runtime.execute(
      {
        steps: [
          byLabel("drone", "Aurora Drone"),
          { id: "components", op: "parts.components", input: { from: "$drone", depth: "all" } },
          {
            id: "taiwan",
            op: "parts.filter",
            input: {
              from: "$components",
              filters: [{ field: "origin", op: "eq", value: "Taiwan" }],
            },
          },
        ],
      },
      { ctx },
    );
    expect(result.steps.map((s) => s.count)).toEqual([1, 3, 2]);
    expect(result.text).toContain("components (parts): 3 matched");
    expect(result.text).toContain(
      "taiwan (parts): 2 matched\n  1. Sensor Board\n  2. Voltage Regulator",
    );
    expect(result.text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it("06 finds indirect demand with quantity arithmetic: 1 × 4 = 4", async () => {
    const { runtime, ctx } = createSupplyChainRuntime();
    const result = await runtime.execute(
      {
        steps: [
          byLabel("from", "Aurora Drone"),
          byLabel("to", "Voltage Regulator"),
          { id: "rel", op: "bom.paths", input: { from: "$from", to: "$to" } },
        ],
      },
      { ctx },
    );
    expect(result.text).toContain("from (parts): 1 matched");
    expect(result.text).toContain("to (parts): 1 matched");
    expect(result.text).toContain(
      "rel (paths): 1 matched\n  1. Aurora Drone indirectly needs 4 × Voltage Regulator (2 hops)",
    );
  });

  it("07 finds the finished product, and every parent at depth all", async () => {
    const { runtime, ctx } = createSupplyChainRuntime();
    const finished = await runtime.execute(
      {
        steps: [
          byLabel("target", "Voltage Regulator"),
          { id: "product", op: "parts.usedIn", input: { from: "$target", depth: "ultimate" } },
        ],
      },
      { ctx },
    );
    expect(finished.text).toContain("product (parts): 1 matched\n  1. Aurora Starter Kit");

    const all = await runtime.execute(
      {
        steps: [
          byLabel("target", "Voltage Regulator"),
          { id: "parents", op: "parts.usedIn", input: { from: "$target", depth: "all" } },
        ],
      },
      { ctx },
    );
    expect(all.text).toContain(
      "parents (parts): 3 matched\n  1. Power Module\n  2. Aurora Drone\n  3. Aurora Starter Kit",
    );
  });

  it("08 lists the links of the Power Module with endpoint labels", async () => {
    const { runtime, ctx } = createSupplyChainRuntime();
    const result = await runtime.execute(
      {
        steps: [
          byLabel("module", "Power Module", "eq"),
          { id: "links", op: "links.find", input: { involving: "$module" } },
        ],
      },
      { ctx },
    );
    expect(result.text).toContain(
      [
        "links (links): 2 matched",
        "  1. Aurora Drone to Power Module (Contains 1)",
        "  2. Power Module to Voltage Regulator (Contains 4)",
      ].join("\n"),
    );
  });

  it("09 resolves quantity and its synonyms to the Contains label", async () => {
    const { runtime, ctx } = createSupplyChainRuntime();
    for (const field of ["quantity", "qty", "units", "perUnit", "label"]) {
      const result = await runtime.execute(
        {
          steps: [
            {
              id: "four",
              op: "links.find",
              input: { filters: [{ field, op: "eq", value: "4" }] },
            },
          ],
        },
        { ctx, session: { id: field } },
      );
      expect(result.text, field).toBe(
        "four (links): 1 matched\n  1. Power Module to Voltage Regulator (Contains 4)",
      );
    }
  });

  it("10 disambiguates two parts with the same label by ordinal", async () => {
    const { runtime, ctx } = createSupplyChainRuntime(withDuplicateRegulator());
    const session = { id: "dup" };
    const first = await runtime.execute(
      {
        steps: [
          byLabel("found", "Voltage Regulator"),
          { id: "matches", op: "parts.details", input: { from: "$found", fields: ["origin"] } },
        ],
      },
      { ctx, session },
    );
    expect(first.text).toContain(
      [
        "matches (parts): 2 matched",
        "  1. Voltage Regulator - origin: Taiwan",
        "  2. Voltage Regulator - origin: not recorded",
      ].join("\n"),
    );
    const second = await runtime.execute(
      { steps: [{ id: "sel", op: "orders.reserve", input: { refs: ["$matches[2]"] } }] },
      { ctx, session },
    );
    expect(second.ok).toBe(true);
    expect(ctx.reserved).toEqual([ids.regulatorDuplicate]);
  });

  it("11 turns a link field used on parts into an actionable error, not an empty result", async () => {
    const { runtime, ctx } = createSupplyChainRuntime();
    const result = await runtime.execute(
      {
        steps: [
          {
            id: "x",
            op: "parts.find",
            input: { filters: [{ field: "relationshipType", op: "eq", value: "Contains" }] },
          },
        ],
      },
      { ctx },
    );
    expect(result.ok).toBe(false);
    expect(result.steps[0]?.status).toBe("error");
    expect(result.text).toBe(
      "x: failed\n  Unknown field 'relationshipType' on parts. Available fields: label, partType, origin.",
    );
  });

  it("12 lists 35 parts showing 30 of 35 while $all[35] still resolves in a later call", async () => {
    const { runtime, ctx } = createSupplyChainRuntime(largeCatalog(29), {
      formatter: createFormatter({
        budgets: { read: 31, preview: 31, total: 10_000 },
        estimateTokens: () => 1,
      }),
    });
    const session = { id: "big" };
    const listing = await runtime.execute(
      { steps: [{ id: "all", op: "parts.find" }] },
      { ctx, session },
    );
    expect(listing.steps[0]?.count).toBe(35);
    expect(listing.text).toContain("all (parts): 35 matched");
    expect(listing.text).toContain("  30. Component 24");
    expect(listing.text).not.toContain("  31. ");
    expect(listing.text).toContain("  showing 30 of 35");

    const last = await runtime.execute(
      { steps: [{ id: "last", op: "parts.pick", input: { from: "$all", ordinals: [35] } }] },
      { ctx, session },
    );
    expect(last.text).toBe("last (parts): 1 matched\n  1. Component 29");
  });

  it("13 relates two sets across every link type, and reports a depth cap instead of 'unrelated'", async () => {
    const { runtime, ctx } = createSupplyChainRuntime();
    const result = await runtime.execute(
      {
        steps: [
          {
            id: "assemblies",
            op: "parts.find",
            input: { filters: [{ field: "partType", value: "Assembly" }] },
          },
          {
            id: "tooling",
            op: "parts.find",
            input: { filters: [{ field: "type", value: "Tooling" }] },
          },
          { id: "rel", op: "bom.paths", input: { from: "$assemblies", to: "$tooling" } },
        ],
      },
      { ctx },
    );
    expect(result.text).toContain(
      "rel (paths): 1 matched\n  1. Aurora Drone has a direct requires link to Reflow Fixture (direct)",
    );

    const deep = createSupplyChainRuntime(chainCatalog(10));
    const capped = await deep.runtime.execute(
      {
        steps: [
          byLabel("start", "Stage 0", "eq"),
          byLabel("end", "Stage 10", "eq"),
          { id: "rel", op: "bom.paths", input: { from: "$start", to: "$end" } },
        ],
      },
      { ctx: deep.ctx },
    );
    expect(capped.text).toContain("rel (paths): 0 matched");
    expect(capped.text).toContain(
      "  Search stopped at 8 hops between Stage 0 and Stage 10; longer routes may exist.",
    );
  });

  it("never prints an internal identifier in any scenario", async () => {
    const { runtime, ctx } = createSupplyChainRuntime();
    const result = await runtime.execute(
      {
        steps: [
          { id: "all", op: "parts.find" },
          { id: "links", op: "links.find" },
          { id: "info", op: "parts.details", input: { from: "$all" } },
          { id: "rel", op: "bom.paths", input: { from: "$all", to: "$all" } },
        ],
      },
      { ctx },
    );
    expect(result.text).not.toMatch(/1111|2222|3333|4444|5555|6666/);
    expect(result.text).not.toMatch(/\bl[1-5]\b/);
  });
});
