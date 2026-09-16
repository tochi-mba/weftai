import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { collection, createRegistry, createRuntime, defineOperation, z } from "weftai";
import { createMcpServer, formatRefResult } from "./index.js";

const Item = z.object({ id: z.string(), label: z.string() });
const Items = collection("items", Item, {
  label: (item) => item.label,
  key: (item) => item.id,
});

const find = defineOperation({
  name: "items.find",
  description: "Find items.",
  input: z.object({}),
  output: Items,
  run: () => [{ id: "a", label: "Alpha" }],
});

const registry = createRegistry({ operations: [find] });

async function connect(runtime: ReturnType<typeof createRuntime>) {
  const mcp = createMcpServer(runtime, { name: "test", version: "0.0.0", ctx: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), mcp.server.connect(serverTransport)]);
  return client;
}

describe("@weftai/mcp", () => {
  it("lists the three tools", async () => {
    const runtime = createRuntime({ registry });
    const client = await connect(runtime);
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
      "describe_operations",
      "get_result",
      "run_plan",
    ]);
  });

  it("run_plan returns formatted text and stores the session result", async () => {
    const runtime = createRuntime({ registry });
    const client = await connect(runtime);
    const called = await client.callTool({
      name: "run_plan",
      arguments: { steps: [{ id: "all", op: "items.find", input: {} }] },
    });
    const text = textOf(called);
    expect(text).toContain("all (items): 1 matched");
    expect(text).toContain("1. Alpha");
    expect(runtime.store.get("default", "all")?.count).toBe(1);

    const fetched = await client.callTool({
      name: "get_result",
      arguments: { ref: "$all" },
    });
    expect(textOf(fetched)).toContain("Alpha");
  });

  it("describe_operations names every op and the $ref syntax", async () => {
    const runtime = createRuntime({ registry });
    const client = await connect(runtime);
    const described = await client.callTool({ name: "describe_operations", arguments: {} });
    const text = textOf(described);
    expect(text).toContain("items.find");
    expect(text).toContain("$stepId");
  });

  it("get_result names the fix when the ref is missing", () => {
    const runtime = createRuntime({ registry });
    const message = formatRefResult(runtime, "default", "$missing");
    expect(message).toContain("Could not read '$missing'");
    expect(message).toContain("Run a plan first");
  });
});

function textOf(result: unknown): string {
  if (typeof result !== "object" || result === null) return String(result);
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return JSON.stringify(result);
  return content
    .map((block) => {
      if (typeof block === "object" && block !== null && "text" in block) {
        return String((block as { text: unknown }).text);
      }
      return "";
    })
    .join("");
}
