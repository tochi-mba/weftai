import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, describe, expect, it, vi } from "vitest";
import { dispatch, USAGE } from "./commands.js";
import { unwrap } from "./domain.js";
import { parseArgv } from "./parse.js";
import { runCli } from "./run.js";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const domain = join(root, "examples/supply-chain/src/domain.ts");

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

const dir = mkdtempSync(join(tmpdir(), "weftai-cli-mcp-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("weftai mcp", { timeout: 60_000 }, () => {
  it("serves the domain over the given transport and answers a plan", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const cap = capture();
    const serving = dispatch(
      parseArgv(["mcp", "--domain", domain, "--name", "supply-chain"]),
      cap.io,
      { mcpTransport: serverTransport },
    );
    await client.connect(clientTransport);
    expect(cap.stderr).toContain("Serving MCP on stdio.");
    expect(client.getServerVersion()?.name).toBe("supply-chain");
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
      "describe_operations",
      "get_result",
      "run_plan",
    ]);
    const result = await client.callTool({
      name: "run_plan",
      arguments: {
        steps: [
          {
            id: "drone",
            op: "parts.find",
            input: { filters: [{ field: "label", op: "fuzzy", value: "Aurora Drone" }] },
          },
        ],
      },
    });
    const text = (result as { content: { text?: string }[] }).content
      .map((block) => block.text ?? "")
      .join("");
    expect(text).toBe("drone (parts): 1 matched\n  1. Aurora Drone");
    // The command stays alive until the client goes away, then exits cleanly.
    await client.close();
    expect(await serving).toBe(0);
  });

  it("defaults the server name", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const cap = capture();
    const serving = dispatch(parseArgv(["mcp", "--domain", domain]), cap.io, {
      mcpTransport: serverTransport,
    });
    await client.connect(clientTransport);
    expect(client.getServerVersion()?.name).toBe("weftai");
    await client.close();
    expect(await serving).toBe(0);
  });
});

describe("unwrap", () => {
  const module = { registry: {}, createContext: () => ({}) };

  it("accepts a default export or named exports", () => {
    expect(unwrap({ default: module })).toBe(module);
    expect(unwrap(module)).toBe(module);
  });

  it("falls back to the module itself when default is not a domain", () => {
    const named = { default: 5, ...module };
    expect(unwrap(named)).toBe(named);
  });

  it("rejects non-objects", () => {
    for (const bad of [null, undefined, 5, "x"]) {
      expect(() => unwrap(bad)).toThrow("Domain module did not export an object.");
    }
  });
});

describe("runCli edge cases", { timeout: 60_000 }, () => {
  it("writes to the real process streams by default", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      expect(await runCli(["help"])).toBe(0);
      expect(write).toHaveBeenCalledWith(USAGE);
    } finally {
      write.mockRestore();
    }
  });

  it("reports a non-Error thrown while loading a domain", async () => {
    const throwing = join(dir, "throws.ts");
    writeFileSync(throwing, 'throw "boom";\n');
    const cap = capture();
    expect(await runCli(["describe", "--domain", throwing], cap.io)).toBe(1);
    expect(cap.stderr.startsWith("boom\n")).toBe(true);
  });

  it("stops parsing at a missing argument slot", () => {
    const args = parseArgv(["run", undefined as unknown as string, "x"]);
    expect(args.command).toBe("run");
    expect(args.positionals).toEqual([]);
  });
});
