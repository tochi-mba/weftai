import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createMcpServer } from "@weftai/mcp";
import {
  createRuntime,
  type ExecutionResult,
  formatIssues,
  type Trace,
  validatePlan,
} from "weftai";
import { loadDomain } from "./domain.js";
import { boolFlag, type CliArgs, flag } from "./parse.js";
import { writeScaffold } from "./scaffold.js";

export const USAGE = `Usage:
  weftai run <plan.json> --domain <file> [--fixture <file>] [--trace out.json] [--format text|json]
  weftai validate <plan.json> --domain <file>
  weftai describe --domain <file> [--json]
  weftai trace <trace.json>
  weftai mcp --domain <file> [--fixture <file>] [--name <name>]
  weftai init [dir]
`;

export interface Io {
  readonly stdout: { write(chunk: string): void };
  readonly stderr: { write(chunk: string): void };
}

export interface DispatchOptions {
  /** Transport for the `mcp` command instead of stdio (used by tests and embedders). */
  readonly mcpTransport?: Transport | undefined;
}

export async function dispatch(
  args: CliArgs,
  io: Io,
  options: DispatchOptions = {},
): Promise<number> {
  switch (args.command) {
    case undefined:
    case "help":
      io.stdout.write(USAGE);
      return 0;
    case "run":
      return runCommand(args, io);
    case "validate":
      return validateCommand(args, io);
    case "describe":
      return describeCommand(args, io);
    case "trace":
      return traceCommand(args, io);
    case "mcp":
      return mcpCommand(args, io, options.mcpTransport);
    case "init":
      return initCommand(args, io);
    default:
      io.stderr.write(`Unknown command '${args.command}'.\n${USAGE}`);
      return 2;
  }
}

async function runCommand(args: CliArgs, io: Io): Promise<number> {
  const planPath = args.positionals[0];
  const domainPath = flag(args, "domain");
  if (planPath === undefined || domainPath === undefined) {
    io.stderr.write("run requires <plan.json> and --domain <file>.\n");
    return 2;
  }
  const domain = await loadDomain(domainPath);
  const runtime = createRuntime({ registry: domain.registry });
  const ctx = await domain.createContext(flag(args, "fixture"));
  const plan = readJson(planPath);
  const result = await runtime.execute(plan, { ctx });
  const format = flag(args, "format") ?? "text";
  if (format === "json") {
    io.stdout.write(`${JSON.stringify(publicResult(result), null, 2)}\n`);
  } else {
    io.stdout.write(`${result.text}\n`);
  }
  const tracePath = flag(args, "trace");
  if (tracePath !== undefined) {
    writeFileSync(resolve(tracePath), `${JSON.stringify(result.trace, null, 2)}\n`);
  }
  return result.ok ? 0 : 1;
}

async function validateCommand(args: CliArgs, io: Io): Promise<number> {
  const planPath = args.positionals[0];
  const domainPath = flag(args, "domain");
  if (planPath === undefined || domainPath === undefined) {
    io.stderr.write("validate requires <plan.json> and --domain <file>.\n");
    return 2;
  }
  const domain = await loadDomain(domainPath);
  const plan = readJson(planPath);
  const validation = validatePlan(plan, domain.registry);
  if (validation.ok) {
    io.stdout.write(`OK: ${validation.plan.steps.length} step(s).\n`);
    return 0;
  }
  io.stderr.write(`${formatIssues(validation.issues)}\n`);
  return 1;
}

async function describeCommand(args: CliArgs, io: Io): Promise<number> {
  const domainPath = flag(args, "domain");
  if (domainPath === undefined) {
    io.stderr.write("describe requires --domain <file>.\n");
    return 2;
  }
  const domain = await loadDomain(domainPath);
  if (boolFlag(args, "json")) {
    io.stdout.write(
      `${JSON.stringify(domain.registry.planSchema({ style: "union", strict: true }), null, 2)}\n`,
    );
  } else {
    io.stdout.write(`${domain.registry.describe()}\n`);
  }
  return 0;
}

function traceCommand(args: CliArgs, io: Io): Promise<number> {
  const path = args.positionals[0];
  if (path === undefined) {
    io.stderr.write("trace requires <trace.json>.\n");
    return Promise.resolve(2);
  }
  const trace = readJson(path) as Trace;
  io.stdout.write(`${formatTrace(trace)}\n`);
  return Promise.resolve(0);
}

async function mcpCommand(args: CliArgs, io: Io, transport?: Transport): Promise<number> {
  const domainPath = flag(args, "domain");
  if (domainPath === undefined) {
    io.stderr.write("mcp requires --domain <file>.\n");
    return 2;
  }
  const domain = await loadDomain(domainPath);
  const runtime = createRuntime({ registry: domain.registry });
  const ctx = await domain.createContext(flag(args, "fixture"));
  const mcp = createMcpServer(runtime, {
    name: flag(args, "name") ?? "weftai",
    ctx,
  });
  io.stderr.write("Serving MCP on stdio. Press Ctrl+C to stop.\n");
  await mcp.connectStdio(transport);
  // Stay alive until the client closes the transport (stdin ends); returning here would exit.
  await new Promise<void>((resolve) => {
    mcp.server.server.onclose = resolve;
  });
  return 0;
}

function initCommand(args: CliArgs, io: Io): Promise<number> {
  const dir = resolve(args.positionals[0] ?? ".");
  const written = writeScaffold(dir);
  io.stdout.write(`Wrote ${written.length} files in ${dir}.\n`);
  return Promise.resolve(0);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function publicResult(result: ExecutionResult<unknown>) {
  return {
    ok: result.ok,
    text: result.text,
    durationMs: result.durationMs,
    steps: result.steps.map((step) => ({
      id: step.id,
      operation: step.operation,
      status: step.status,
      count: step.count,
      notices: step.notices,
      error: step.error,
    })),
    trace: result.trace,
  };
}

export function formatTrace(trace: Trace): string {
  const header =
    pad("STEP", 12) +
    pad("OP", 24) +
    pad("STATUS", 10) +
    pad("COUNT", 8) +
    pad("MS", 8) +
    "NOTICES";
  const rows = trace.steps.map((step) => {
    const notices = step.notices.length === 0 ? "" : step.notices.join("; ");
    return (
      pad(step.id, 12) +
      pad(step.operation, 24) +
      pad(step.status, 10) +
      pad(step.output?.count === undefined ? "-" : String(step.output.count), 8) +
      pad(String(step.durationMs), 8) +
      notices
    );
  });
  const ok = trace.ok ? "ok" : "failed";
  return [`${ok}  ${trace.durationMs}ms  ${trace.steps.length} step(s)`, header, ...rows].join(
    "\n",
  );
}

function pad(value: string, width: number): string {
  return value.length >= width ? `${value} ` : value.padEnd(width);
}
