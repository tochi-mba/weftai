import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import { USAGE } from "./commands.js";

/** The bin entry cannot run in-process (it calls process.exit), so it is spawned through jiti. */
const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));
const pkg = fileURLToPath(new URL("..", import.meta.url));

function run(args: readonly string[]) {
  return spawnSync(process.execPath, ["--import", "jiti/register", cli, ...args], {
    cwd: pkg,
    encoding: "utf8",
    timeout: 60_000,
  });
}

describe("weftai bin", { timeout: 90_000 }, () => {
  it("prints usage and exits 0 for help", () => {
    const result = run(["help"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(USAGE);
  });

  it("exits 2 for an unknown command", () => {
    const result = run(["frobnicate"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unknown command 'frobnicate'.");
  });

  it("serves the supply-chain domain over real stdio", async () => {
    const domain = join(
      fileURLToPath(new URL("../../..", import.meta.url)),
      "examples/supply-chain/src/domain.ts",
    );
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "jiti/register", cli, "mcp", "--domain", domain, "--name", "supply-chain"],
      cwd: pkg,
      stderr: "pipe",
    });
    const client = new Client({ name: "stdio-test", version: "0.0.0" });
    try {
      await client.connect(transport);
      expect(client.getServerVersion()?.name).toBe("supply-chain");
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toContain("run_plan");
      const result = await client.callTool({
        name: "run_plan",
        arguments: { steps: [{ id: "all", op: "parts.find" }] },
      });
      const text = (result as { content: { text?: string }[] }).content
        .map((block) => block.text ?? "")
        .join("");
      expect(text).toContain("all (parts): 6 matched");
    } finally {
      await client.close();
    }
  });
});
