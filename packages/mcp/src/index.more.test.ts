import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { collection, createRegistry, createRuntime, defineOperation, VERSION, z } from "weftai";
import { createMcpServer, formatRefResult, type McpServerOptions } from "./index.js";

const Item = z.object({ id: z.string(), label: z.string() });
const Items = collection("items", Item, { label: (item) => item.label, key: (item) => item.id });
type Ctx = { readonly items: readonly z.infer<typeof Item>[] };

const find = defineOperation({
  name: "items.find",
  description: "Find items.",
  input: z.object({}),
  output: Items,
  run: ({ ctx }: { ctx: Ctx }) => ctx.items,
});
const select = defineOperation({
  name: "selection.select",
  description: "Select.",
  input: z.object({}),
  output: Items,
  effects: "write" as const,
  run: () => [],
});
const registry = createRegistry<Ctx>({ operations: [find, select] });
const items = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
];

async function connect(options: Partial<McpServerOptions<Ctx>> = {}) {
  const runtime = createRuntime({ registry });
  const mcp = createMcpServer(runtime, { name: "test", ctx: { items }, ...options });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), mcp.server.connect(serverTransport)]);
  return { client, runtime };
}

function textOf(result: unknown): string {
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content.map((block) => String((block as { text?: unknown }).text ?? "")).join("");
}

const isError = (result: unknown) => (result as { isError?: boolean }).isError === true;

describe("@weftai/mcp: get_result", () => {
  it("reads a whole result and specific positions", async () => {
    const { client } = await connect();
    await client.callTool({
      name: "run_plan",
      arguments: { steps: [{ id: "all", op: "items.find" }] },
    });
    const whole = await client.callTool({ name: "get_result", arguments: { ref: "$all" } });
    expect(isError(whole)).toBe(false);
    expect(textOf(whole)).toBe("items: 2 matched\n  1. Alpha\n  2. Beta");
    const second = await client.callTool({ name: "get_result", arguments: { ref: "$all[2]" } });
    expect(textOf(second)).toBe("items: 1 matched\n  1. Beta");
  });

  it("reports an out-of-range position as an error with the valid range", async () => {
    const { client } = await connect();
    await client.callTool({
      name: "run_plan",
      arguments: { steps: [{ id: "all", op: "items.find" }] },
    });
    const result = await client.callTool({ name: "get_result", arguments: { ref: "$all[5]" } });
    expect(isError(result)).toBe(true);
    expect(textOf(result)).toContain("asks for position 5, but 'all' holds 2 item(s)");
  });

  it("reports bad syntax and lists stored results when the name is unknown", async () => {
    const { client } = await connect();
    const bad = await client.callTool({ name: "get_result", arguments: { ref: "all" } });
    expect(isError(bad)).toBe(true);
    expect(textOf(bad)).toContain("is not a valid reference");
    await client.callTool({
      name: "run_plan",
      arguments: { steps: [{ id: "all", op: "items.find" }] },
    });
    const missing = await client.callTool({ name: "get_result", arguments: { ref: "$nope" } });
    expect(textOf(missing)).toBe(
      "Could not read '$nope': no result named 'nope' is stored. Stored results: all.",
    );
  });

  it("formatRefResult labels plain and object items", () => {
    const runtime = createRuntime({ registry });
    runtime.store.set("s", {
      id: "mixed",
      operation: "x.y",
      kind: "collection",
      type: "rows",
      data: [],
      items: ["plain", 7, { label: "L" }, { other: 1 }],
      count: 4,
      notices: [],
      storedAt: 0,
    });
    expect(formatRefResult(runtime, "s", "$mixed")).toBe(
      'rows: 4 matched\n  1. plain\n  2. 7\n  3. L\n  4. {"other":1}',
    );
  });
});

describe("@weftai/mcp: run_plan and options", () => {
  it("marks a failed plan as an error while still returning the text", async () => {
    const { client } = await connect();
    const result = await client.callTool({
      name: "run_plan",
      arguments: { steps: [{ id: "a", op: "items.nope" }] },
    });
    expect(isError(result)).toBe(true);
    expect(textOf(result)).toContain("Unknown operation 'items.nope'");
  });

  it("scopes the operations with include and reports the rest as unknown", async () => {
    const { client } = await connect({ include: (op) => op.effects === "read" });
    const described = await client.callTool({ name: "describe_operations", arguments: {} });
    expect(textOf(described)).toContain("items.find");
    expect(textOf(described)).not.toContain("selection.select");
    const result = await client.callTool({
      name: "run_plan",
      arguments: { steps: [{ id: "s", op: "selection.select" }] },
    });
    expect(isError(result)).toBe(true);
  });

  it("honours allowWrites: false", async () => {
    const { client } = await connect({ allowWrites: false });
    const result = await client.callTool({
      name: "run_plan",
      arguments: { steps: [{ id: "s", op: "selection.select" }] },
    });
    expect(isError(result)).toBe(true);
    expect(textOf(result)).toContain("cannot be used in this tool");
  });

  it("allows writes by default when the registry has any", async () => {
    const { client } = await connect();
    const result = await client.callTool({
      name: "run_plan",
      arguments: { steps: [{ id: "s", op: "selection.select" }] },
    });
    expect(isError(result)).toBe(false);
  });

  it("uses the given session id and a context factory", async () => {
    let calls = 0;
    const { client, runtime } = await connect({
      session: { id: "conv" },
      ctx: async () => {
        calls += 1;
        return { items };
      },
    });
    await client.callTool({
      name: "run_plan",
      arguments: { steps: [{ id: "all", op: "items.find" }] },
    });
    expect(runtime.store.get("conv", "all")?.count).toBe(2);
    expect(calls).toBe(1);
  });

  it("reports the package version by default and a custom one when given", async () => {
    const { client } = await connect();
    expect(client.getServerVersion()).toEqual({ name: "test", version: VERSION });
    const custom = await connect({ version: "9.9.9" });
    expect(custom.client.getServerVersion()?.version).toBe("9.9.9");
  });

  it("exposes the server for other transports", async () => {
    const runtime = createRuntime({ registry });
    const mcp = createMcpServer(runtime, { name: "t", ctx: { items } });
    expect(typeof mcp.server.connect).toBe("function");
    expect(typeof mcp.connectStdio).toBe("function");
  });
});
