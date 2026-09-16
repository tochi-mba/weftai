import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import type { Trace } from "weftai";
import { formatTrace } from "./commands.js";
import { sourceAliases } from "./domain.js";

const step = (overrides: Partial<Trace["steps"][number]>): Trace["steps"][number] => ({
  id: "acme",
  operation: "nodes.find",
  status: "ok",
  dependencies: [],
  input: {},
  output: { kind: "collection", type: "nodes", count: 1 },
  notices: [],
  error: undefined,
  skippedBecause: undefined,
  startedAt: 0,
  durationMs: 3,
  ...overrides,
});

describe("formatTrace", () => {
  it("renders a failed trace with a dash for missing counts and joined notices", () => {
    const table = formatTrace({
      version: 1,
      ok: false,
      durationMs: 12,
      steps: [
        step({ id: "acme", notices: ["first", "second"] }),
        step({ id: "broken", status: "error", output: undefined, error: "boom" }),
      ],
      issues: undefined,
    });
    const [summary, header, first, second] = table.split("\n");
    expect(summary).toBe("failed  12ms  2 step(s)");
    expect(header).toMatch(/^STEP\s+OP\s+STATUS\s+COUNT\s+MS\s+NOTICES$/);
    expect(first).toMatch(/^acme\s+nodes\.find\s+ok\s+1\s+3\s+first; second$/);
    expect(second).toMatch(/^broken\s+nodes\.find\s+error\s+-\s+3\s*$/);
  });

  it("keeps long values readable by padding with a single space", () => {
    const table = formatTrace({
      version: 1,
      ok: true,
      durationMs: 0,
      steps: [
        step({ id: "aVeryLongStepIdentifier", operation: "namespace.operationWithLongName" }),
      ],
      issues: undefined,
    });
    expect(table).toContain("aVeryLongStepIdentifier namespace.operationWithLongName ok");
  });

  it("renders an empty trace", () => {
    const table = formatTrace({
      version: 1,
      ok: true,
      durationMs: 0,
      steps: [],
      issues: undefined,
    });
    expect(table.split("\n")).toHaveLength(2);
  });
});

describe("sourceAliases", () => {
  it("aliases weftai to the core source inside the repository", () => {
    expect(Object.keys(sourceAliases())).toEqual(["weftai"]);
    expect(sourceAliases().weftai).toMatch(/core[\\/]src[\\/]index\.ts$/);
  });

  it("adds no alias in a published layout where no source exists", () => {
    const published = pathToFileURL(
      join(tmpdir(), "nowhere", "node_modules", "@weftai", "cli", "dist", "domain.js"),
    ).href;
    expect(sourceAliases(published)).toEqual({});
  });
});
