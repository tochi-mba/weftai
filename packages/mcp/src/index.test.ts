import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { collection, createRegistry, createRuntime, defineOperation, z } from "weftai";
import { createMcpServer, formatRefResult, planAnnotations } from "./index.js";

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

  it("annotates every tool, so a client need not assume each is destructive and open-world", async () => {
    const runtime = createRuntime({ registry });
    const client = await connect(runtime);
    const listed = await client.listTools();
    const byName = new Map(listed.tools.map((tool) => [tool.name, tool.annotations]));
    const localRead = {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    };
    expect(byName.get("describe_operations")).toEqual(localRead);
    expect(byName.get("get_result")).toEqual(localRead);
    // items.find is a read declared with no annotations: read-only, but it may reach outside.
    expect(byName.get("run_plan")).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
  });

  it("derives run_plan's annotations from the operations it can actually run", () => {
    const drop = defineOperation({
      name: "items.drop",
      description: "Drop items.",
      input: z.object({}),
      output: Items,
      effects: "write",
      run: () => [],
    });
    const tag = defineOperation({
      name: "items.tag",
      description: "Tag items.",
      input: z.object({}),
      output: Items,
      effects: "write",
      annotations: { destructive: false, idempotent: true, openWorld: false },
      run: () => [],
    });
    expect(planAnnotations([find, drop], undefined)).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    });
    expect(planAnnotations([tag], true)).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    // With writes refused, the writes it lists cannot run, so they do not count.
    expect(planAnnotations([find, drop], false)).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
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
