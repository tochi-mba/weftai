import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatTrace } from "./commands.js";
import { parseArgv } from "./parse.js";
import { runCli } from "./run.js";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const domain = join(root, "examples/diagram/src/domain.ts");
const delaware = join(root, "examples/diagram/plans/05-delaware.json");
const unknownField = join(root, "examples/diagram/plans/11-unknown-field.json");

function capture() {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      stdout: {
        write(chunk: string) {
          stdout += chunk;
        },
      },
      stderr: {
        write(chunk: string) {
          stderr += chunk;
        },
      },
    },
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
  };
}

describe("weftai CLI", { timeout: 30_000 }, () => {
  it("parses flags and positionals", () => {
    const args = parseArgv(["run", "plan.json", "--domain", "d.ts", "--format=json"]);
    expect(args.command).toBe("run");
    expect(args.positionals).toEqual(["plan.json"]);
    expect(args.flags.domain).toBe("d.ts");
    expect(args.flags.format).toBe("json");
  });

  it("validates the Delaware plan", async () => {
    const cap = capture();
    const code = await runCli(["validate", delaware, "--domain", domain], cap.io);
    expect(code).toBe(0);
    expect(cap.stdout).toContain("OK: 3 step(s).");
  });

  it("runs the Delaware plan and prints formatted counts", async () => {
    const cap = capture();
    const code = await runCli(["run", delaware, "--domain", domain], cap.io);
    expect(code, cap.stdout + cap.stderr).toBe(0);
    expect(cap.stdout).toContain("acme (nodes): 1 matched");
    expect(cap.stdout).toContain("owned (nodes): 3 matched");
    expect(cap.stdout).toContain("delaware (nodes): 2 matched");
    expect(cap.stdout).toContain("Sub 2 Ltd");
  });

  it("exits 1 when a wrong field is used", async () => {
    const cap = capture();
    const code = await runCli(["run", unknownField, "--domain", domain], cap.io);
    expect(code).toBe(1);
    expect(cap.stdout).toContain("Unknown field 'relationshipType' on nodes.");
    expect(cap.stdout).toContain("Available fields: label, entityType, Jurisdiction.");
  });

  it("describes operations including $ref syntax", async () => {
    const cap = capture();
    const code = await runCli(["describe", "--domain", domain], cap.io);
    expect(code).toBe(0);
    expect(cap.stdout).toContain("nodes.find");
    expect(cap.stdout).toContain("$stepId");
  });

  it("prints a trace table", async () => {
    const table = formatTrace({
      version: 1,
      ok: true,
      durationMs: 12,
      steps: [
        {
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
        },
      ],
      issues: undefined,
    });
    expect(table).toContain("ok");
    expect(table).toContain("acme");
    expect(table).toContain("nodes.find");
    expect(table).toContain("1");
  });

  it("writes a trace file from run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "weftai-cli-"));
    const tracePath = join(dir, "out.json");
    const cap = capture();
    const code = await runCli(["run", delaware, "--domain", domain, "--trace", tracePath], cap.io);
    expect(code, `${cap.stdout}${cap.stderr}`).toBe(0);
    const trace = JSON.parse(readFileSync(tracePath, "utf8")) as { steps: unknown[] };
    expect(trace.steps).toHaveLength(3);
    const listed = capture();
    expect(await runCli(["trace", tracePath], listed.io)).toBe(0);
    expect(listed.stdout).toContain("acme");
    expect(listed.stdout).toContain("delaware");
    rmSync(dir, { recursive: true, force: true });
  });

  it("scaffolds a domain that can execute a plan", async () => {
    const dir = mkdtempSync(join(tmpdir(), "weftai-init-"));
    const cap = capture();
    expect(await runCli(["init", dir], cap.io)).toBe(0);
    expect(cap.stdout).toContain("Wrote 7 files");
    const plan = join(dir, "plan.json");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(plan, JSON.stringify({ steps: [{ id: "all", op: "items.find" }] }));
    const ran = capture();
    const code = await runCli(
      [
        "run",
        plan,
        "--domain",
        join(dir, "src/domain.ts"),
        "--fixture",
        join(dir, "src/fixture.json"),
      ],
      ran.io,
    );
    expect(code).toBe(0);
    expect(ran.stdout).toContain("all (items): 2 matched");
    expect(ran.stdout).toContain("1. Alpha");
    rmSync(dir, { recursive: true, force: true });
  });
});
