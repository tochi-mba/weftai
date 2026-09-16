import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { USAGE } from "./commands.js";
import { boolFlag, flag, parseArgv } from "./parse.js";
import { runCli } from "./run.js";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const domain = join(root, "examples/diagram/src/domain.ts");
const delaware = join(root, "examples/diagram/plans/05-delaware.json");

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

const dir = mkdtempSync(join(tmpdir(), "agentweft-cli-more-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("parseArgv", () => {
  it("separates the command, positionals and flags", () => {
    const args = parseArgv(["run", "a.json", "--domain", "d.ts", "--json", "--n=3", "b.json"]);
    expect(args.command).toBe("run");
    expect(args.positionals).toEqual(["a.json", "b.json"]);
    expect(args.flags).toEqual({ domain: "d.ts", json: true, n: "3" });
  });

  it("treats everything after -- as positionals", () => {
    const args = parseArgv(["trace", "--", "--not-a-flag", "x"]);
    expect(args.positionals).toEqual(["--not-a-flag", "x"]);
    expect(args.flags).toEqual({});
  });

  it("does not swallow a following flag as a value", () => {
    const args = parseArgv(["describe", "--json", "--domain", "d.ts"]);
    expect(args.flags).toEqual({ json: true, domain: "d.ts" });
  });

  it("handles no arguments", () => {
    expect(parseArgv([])).toEqual({ command: undefined, positionals: [], flags: {} });
  });

  it("flag and boolFlag read typed values", () => {
    const args = parseArgv(["x", "--a", "v", "--b", "--c=true", "--d=false"]);
    expect(flag(args, "a")).toBe("v");
    expect(flag(args, "b")).toBeUndefined();
    expect(flag(args, "missing")).toBeUndefined();
    expect(boolFlag(args, "b")).toBe(true);
    expect(boolFlag(args, "c")).toBe(true);
    expect(boolFlag(args, "d")).toBe(false);
    expect(boolFlag(args, "a")).toBe(false);
    expect(boolFlag(args, "missing")).toBe(false);
  });
});

describe("agentweft CLI: usage and argument errors", { timeout: 60_000 }, () => {
  it("prints usage for no command and for help", async () => {
    for (const argv of [[], ["help"]]) {
      const cap = capture();
      expect(await runCli(argv, cap.io)).toBe(0);
      expect(cap.stdout).toBe(USAGE);
    }
  });

  it("rejects an unknown command with usage on stderr", async () => {
    const cap = capture();
    expect(await runCli(["frobnicate"], cap.io)).toBe(2);
    expect(cap.stderr).toContain("Unknown command 'frobnicate'.");
    expect(cap.stderr).toContain("Usage:");
  });

  it.each([
    [["run"], "run requires <plan.json> and --domain <file>."],
    [["run", "plan.json"], "run requires <plan.json> and --domain <file>."],
    [["validate"], "validate requires <plan.json> and --domain <file>."],
    [["describe"], "describe requires --domain <file>."],
    [["trace"], "trace requires <trace.json>."],
    [["mcp"], "mcp requires --domain <file>."],
  ])("exits 2 for %j", async (argv, message) => {
    const cap = capture();
    expect(await runCli(argv, cap.io)).toBe(2);
    expect(cap.stderr).toContain(message);
  });

  it("exits 1 with the message and usage when a domain file cannot be loaded", async () => {
    const cap = capture();
    expect(await runCli(["describe", "--domain", join(dir, "missing.ts")], cap.io)).toBe(1);
    expect(cap.stderr).toContain("Usage:");
    expect(cap.stderr.length).toBeGreaterThan(USAGE.length);
  });

  it("explains the domain contract when the module exports the wrong shape", async () => {
    const bad = join(dir, "bad-domain.ts");
    writeFileSync(bad, "export default { nope: true };\n");
    const cap = capture();
    expect(await runCli(["describe", "--domain", bad], cap.io)).toBe(1);
    expect(cap.stderr).toContain("must default-export { registry, createContext(fixturePath?) }");
  });

  it("accepts a domain that exports registry and createContext as named exports", async () => {
    const named = join(dir, "named-domain.ts");
    const source = `export { registry } from ${JSON.stringify(domain.replace(/\\/g, "/"))};
export { loadContext as createContext } from ${JSON.stringify(domain.replace(/\\/g, "/"))};
`;
    writeFileSync(named, source);
    const cap = capture();
    expect(await runCli(["validate", delaware, "--domain", named], cap.io)).toBe(0);
    expect(cap.stdout).toContain("OK: 3 step(s).");
  });

  it("exits 1 when a plan file is not valid JSON", async () => {
    const broken = join(dir, "broken.json");
    writeFileSync(broken, "{ not json");
    const cap = capture();
    expect(await runCli(["validate", broken, "--domain", domain], cap.io)).toBe(1);
  });
});

describe("agentweft CLI: outputs", { timeout: 60_000 }, () => {
  it("reports validation issues on stderr and exits 1", async () => {
    const plan = join(dir, "unknown-op.json");
    writeFileSync(plan, JSON.stringify({ steps: [{ id: "a", op: "nodes.fnd" }] }));
    const cap = capture();
    expect(await runCli(["validate", plan, "--domain", domain], cap.io)).toBe(1);
    expect(cap.stderr).toContain(
      "Step 'a': Unknown operation 'nodes.fnd'. Did you mean 'nodes.find'?",
    );
  });

  it("prints a JSON result with --format json", async () => {
    const cap = capture();
    expect(await runCli(["run", delaware, "--domain", domain, "--format", "json"], cap.io)).toBe(0);
    const parsed = JSON.parse(cap.stdout) as {
      ok: boolean;
      steps: { id: string; count: number }[];
      text: string;
      trace: { version: number };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.steps.map((s) => [s.id, s.count])).toEqual([
      ["acme", 1],
      ["owned", 3],
      ["delaware", 2],
    ]);
    expect(parsed.text).toContain("delaware (nodes): 2 matched");
    expect(parsed.trace.version).toBe(1);
  });

  it("prints the union plan schema with describe --json", async () => {
    const cap = capture();
    expect(await runCli(["describe", "--domain", domain, "--json"], cap.io)).toBe(0);
    const schema = JSON.parse(cap.stdout) as {
      properties: { steps: { items: { anyOf: unknown[] } } };
    };
    expect(schema.properties.steps.items.anyOf.length).toBeGreaterThan(5);
  });

  it("runs against a fixture file given with --fixture", async () => {
    const fixture = join(root, "examples/diagram/src/fixture.json");
    const cap = capture();
    expect(await runCli(["run", delaware, "--domain", domain, "--fixture", fixture], cap.io)).toBe(
      0,
    );
    expect(cap.stdout).toContain("owned (nodes): 3 matched");
  });

  it("scaffolds into the current directory when no dir is given", async () => {
    const cwd = process.cwd();
    const target = join(dir, "init-here");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(target, { recursive: true });
    process.chdir(target);
    try {
      const cap = capture();
      expect(await runCli(["init"], cap.io)).toBe(0);
      expect(cap.stdout).toContain("Wrote 7 files");
    } finally {
      process.chdir(cwd);
    }
  });
});
