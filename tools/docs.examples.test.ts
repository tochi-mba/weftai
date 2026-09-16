import { readFileSync } from "node:fs";
import { validatePlan } from "agentweft";
import { describe, expect, it } from "vitest";
import { registry } from "../examples/diagram/src/domain.js";

const DOC_NAMES = [
  "concepts.md",
  "plan-format.md",
  "writing-operations.md",
  "formatting.md",
  "adapters.md",
  "cli.md",
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

  it("shows the Delaware plan in concepts.md", () => {
    const md = readDoc("concepts.md");
    expect(md).toContain('"op": "nodes.filter"');
    expect(md).toContain("$owned");
    expect(md).toContain("structural counts");
  });

  it("only shows plans that validate against the diagram domain, so examples cannot drift", () => {
    let checked = 0;
    for (const name of DOC_NAMES) {
      for (const block of planBlocks(readDoc(name))) {
        const plan: unknown = JSON.parse(block);
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
      for (const match of readDoc(name).matchAll(
        /`((?:nodes|edges|graph|selection)\.[a-zA-Z]+)`/g,
      )) {
        expect(known.has(match[1] ?? ""), `${name}: ${match[1]}`).toBe(true);
      }
    }
  });
});
