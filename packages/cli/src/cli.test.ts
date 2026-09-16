import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatTrace } from "./commands.js";
import { parseArgv } from "./parse.js";
import { runCli } from "./run.js";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const domain = join(root, "examples/supply-chain/src/domain.ts");
const taiwan = join(root, "examples/supply-chain/plans/taiwan-components.json");
const unknownField = join(root, "examples/supply-chain/plans/unknown-field.json");

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

  it("validates the Taiwan components plan", async () => {
    const cap = capture();
    const code = await runCli(["validate", taiwan, "--domain", domain], cap.io);
    expect(code).toBe(0);
    expect(cap.stdout).toContain("OK: 3 step(s).");
  });

  it("runs the Taiwan components plan and prints formatted counts", async () => {
    const cap = capture();
    const code = await runCli(["run", taiwan, "--domain", domain], cap.io);
    expect(code, cap.stdout + cap.stderr).toBe(0);
    expect(cap.stdout).toContain("drone (parts): 1 matched");
    expect(cap.stdout).toContain("components (parts): 3 matched");
    expect(cap.stdout).toContain("taiwan (parts): 2 matched");
    expect(cap.stdout).toContain("Sensor Board");
  });

  it("exits 1 when a wrong field is used", async () => {
    const cap = capture();
    const code = await runCli(["run", unknownField, "--domain", domain], cap.io);
    expect(code).toBe(1);
    expect(cap.stdout).toContain("Unknown field 'relationshipType' on parts.");
    expect(cap.stdout).toContain("Available fields: label, partType, origin.");
  });

  it("describes operations including $ref syntax", async () => {
    const cap = capture();
    const code = await runCli(["describe", "--domain", domain], cap.io);
    expect(code).toBe(0);
    expect(cap.stdout).toContain("parts.find");
    expect(cap.stdout).toContain("$stepId");
  });

  it("prints a trace table", () => {
    const table = formatTrace({
      version: 1,
      ok: true,
      durationMs: 12,
      steps: [
        {
          id: "drone",
          operation: "parts.find",
          status: "ok",
          dependencies: [],
          input: {},
          output: { kind: "collection", type: "parts", count: 1 },
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
    expect(table).toContain("drone");
    expect(table).toContain("parts.find");
    expect(table).toContain("1");
  });

  it("writes a trace file from run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "weftai-cli-"));
    const tracePath = join(dir, "out.json");
    const cap = capture();
    const code = await runCli(["run", taiwan, "--domain", domain, "--trace", tracePath], cap.io);
    expect(code, `${cap.stdout}${cap.stderr}`).toBe(0);
    const trace = JSON.parse(readFileSync(tracePath, "utf8")) as { steps: unknown[] };
    expect(trace.steps).toHaveLength(3);
    const listed = capture();
    expect(await runCli(["trace", tracePath], listed.io)).toBe(0);
    expect(listed.stdout).toContain("drone");
    expect(listed.stdout).toContain("taiwan");
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
