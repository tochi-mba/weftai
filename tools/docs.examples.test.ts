import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validatePlan } from "weftai";
import { createSupplyChainRuntime, registry } from "../examples/supply-chain/src/domain.js";

const DOC_NAMES = [
  "concepts.md",
  "plan-format.md",
  "writing-operations.md",
  "formatting.md",
  "adapters.md",
  "providers.md",
  "cli.md",
  "decisions.md",
] as const;

function readDoc(name: string): string {
  return readFileSync(new URL(`../docs/${name}`, import.meta.url), "utf8");
}

/** Every fenced ```json block that looks like a plan. */
function planBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const fence = /```json\n([\s\S]*?)```/g;
  for (const match of markdown.matchAll(fence)) {
    const body = match[1] ?? "";
    if (body.includes('"steps"')) blocks.push(body);
  }
  return blocks;
}

describe("docs", () => {
  it("includes every advertised guide", () => {
    for (const name of DOC_NAMES) {
      expect(readDoc(name).length).toBeGreaterThan(200);
    }
  });

  it("shows the Taiwan components plan in concepts.md", () => {
    const md = readDoc("concepts.md");
    expect(md).toContain('"op": "parts.filter"');
    expect(md).toContain("$components");
    expect(md).toContain("structural counts");
  });

  it("only shows plans that validate against the supply-chain domain, so examples cannot drift", () => {
    let checked = 0;
    for (const name of DOC_NAMES) {
      for (const block of planBlocks(readDoc(name))) {
        const plan = JSON.parse(block) as { rerun?: unknown };
        // A rerun is checked by running it: the plan just before it in the page, then the rerun.
        if (plan.rerun !== undefined) continue;
        const result = validatePlan(plan, registry);
        expect(
          result.ok,
          `${name}: ${result.ok ? "" : result.issues.map((i) => i.message).join("; ")}`,
        ).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("runs every rerun it shows against the plan shown before it", async () => {
    let checked = 0;
    for (const name of DOC_NAMES) {
      const blocks = planBlocks(readDoc(name));
      for (const [index, block] of blocks.entries()) {
        const plan = JSON.parse(block) as { rerun?: unknown };
        if (plan.rerun === undefined) continue;
        const { runtime, ctx } = createSupplyChainRuntime();
        const first = await runtime.execute(JSON.parse(blocks[index - 1] ?? "null"), { ctx });
        expect(first.ok, `${name}: the plan before a rerun runs`).toBe(true);
        const rerun = await runtime.execute(plan, { ctx });
        expect(rerun.ok, `${name}: ${rerun.issues?.map((i) => i.message).join("; ") ?? ""}`).toBe(
          true,
        );
        expect(rerun.rerun?.reused.length, `${name}: something is reused`).toBeGreaterThan(0);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("does not claim unmeasured token or latency savings", () => {
    for (const name of DOC_NAMES) {
      const md = readDoc(name).toLowerCase();
      expect(md).not.toMatch(/tokens saved/);
      expect(md).not.toMatch(/\d+% (faster|fewer tokens)/);
    }
  });

  it("uses only operation names that exist when it names one in backticks", () => {
    const known = new Set(registry.names());
    for (const name of DOC_NAMES) {
      for (const match of readDoc(name).matchAll(/`((?:parts|links|bom|orders)\.[a-zA-Z]+)`/g)) {
        expect(known.has(match[1] ?? ""), `${name}: ${match[1]}`).toBe(true);
      }
    }
  });
});
