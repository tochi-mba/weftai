import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { collection, createRegistry, createRuntime, defineOperation, z } from "weftai";
import { createMcpServer } from "./index.js";

const Items = collection("items", z.object({ label: z.string() }), { label: (i) => i.label });
const registry = createRegistry({
  operations: [
    defineOperation({
      name: "items.find",
      description: "Find.",
      input: z.object({}),
      output: Items,
      run: () => [{ label: "Alpha" }],
    }),
  ],
});

describe("connectStdio", () => {
  it("connects over a supplied transport instead of the process streams", async () => {
    const mcp = createMcpServer(createRuntime({ registry }), { name: "t", ctx: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "c", version: "0.0.0" });
    await Promise.all([mcp.connectStdio(serverTransport), client.connect(clientTransport)]);
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toContain("run_plan");
    await client.close();
  });
});
