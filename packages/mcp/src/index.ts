import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  type AnyOperation,
  PlanSchema,
  parseRef,
  type Runtime,
  resolveRef,
  VERSION,
  z,
} from "weftai";

export interface McpServerOptions<Ctx> {
  readonly name: string;
  readonly version?: string | undefined;
  readonly ctx: Ctx | (() => Ctx | Promise<Ctx>);
  readonly session?: { readonly id: string } | undefined;
  readonly include?: ((operation: AnyOperation<Ctx>) => boolean) | undefined;
  readonly allowWrites?: boolean | undefined;
}

export interface WeftaiMcpServer {
  readonly server: McpServer;
  /** Connect over stdio, or over the given transport (used by tests and embedders). */
  connectStdio(transport?: Transport): Promise<void>;
}

/**
 * MCP server exposing `run_plan`, `describe_operations` and `get_result`.
 * Connect with stdio (`connectStdio`) or any MCP transport (`server.connect(transport)`).
 */
export function createMcpServer<Ctx>(
  runtime: Runtime<Ctx>,
  options: McpServerOptions<Ctx>,
): WeftaiMcpServer {
  const sessionId = options.session?.id ?? "default";
  const scoped =
    options.include === undefined ? runtime.registry : runtime.registry.filter(options.include);
  const allowWrites =
    options.allowWrites ?? scoped.operations.some((operation) => operation.effects === "write");

  const server = new McpServer({
    name: options.name,
    version: options.version ?? VERSION,
  });

  server.registerTool(
    "run_plan",
    {
      description: scoped.describe(),
      inputSchema: PlanSchema,
    },
    async (input) => {
      const ctx = await resolveCtx(options.ctx);
      const result = await runtime.execute(input, {
        ctx,
        session: { id: sessionId },
        allowWrites,
        include: options.include,
      });
      return { content: [{ type: "text" as const, text: result.text }], isError: !result.ok };
    },
  );

  server.registerTool(
    "describe_operations",
    {
      description: "List operations this server can run, with input shapes and the $ref syntax.",
      inputSchema: z.object({}),
    },
    async () => ({
      content: [{ type: "text" as const, text: scoped.describe() }],
    }),
  );

  server.registerTool(
    "get_result",
    {
      description:
        "Read a stored result by $ref (for example $owned or $owned[2]). Positions index the full set, not a preview.",
      inputSchema: z.object({
        ref: z.string().describe("A $stepId or $stepId[1,3] reference."),
      }),
    },
    async ({ ref }) => {
      const text = formatRefResult(runtime, sessionId, ref);
      const failed = text.startsWith("Could not read");
      return { content: [{ type: "text" as const, text }], isError: failed };
    },
  );

  return {
    server,
    async connectStdio(transport?: Transport) {
      /* istanbul ignore next -- the stdio default needs the real process streams; the CLI's stdio test spawns it */
      await server.connect(transport ?? new StdioServerTransport());
    },
  };
}

export function formatRefResult<Ctx>(
  runtime: Runtime<Ctx>,
  sessionId: string,
  refText: string,
): string {
  const parsed = parseRef(refText);
  if (!parsed.ok) return `Could not read '${refText}': ${parsed.message}`;
  const stored = runtime.store.get(sessionId, parsed.ref.id);
  if (stored === undefined) {
    const known = runtime.store.list(sessionId).map((item) => item.id);
    const hint =
      known.length === 0
        ? "No results are stored in this session yet. Run a plan first."
        : `Stored results: ${known.join(", ")}.`;
    return `Could not read '${refText}': no result named '${parsed.ref.id}' is stored. ${hint}`;
  }
  try {
    const resolved = resolveRef(stored, parsed.ref);
    const lines = resolved.items.map((item, index) => `  ${index + 1}. ${itemLabel(item)}`);
    return `${resolved.type}: ${resolved.count} matched\n${lines.join("\n")}`;
  } catch (error) {
    // resolveRef only throws RefResolutionError, whose message names the fix.
    return `Could not read '${refText}': ${(error as Error).message}`;
  }
}

function itemLabel(item: unknown): string {
  if (typeof item === "string" || typeof item === "number") return String(item);
  if (typeof item === "object" && item !== null && "label" in item) {
    return String((item as { label: unknown }).label);
  }
  return JSON.stringify(item);
}

async function resolveCtx<Ctx>(ctx: Ctx | (() => Ctx | Promise<Ctx>)): Promise<Ctx> {
  if (typeof ctx === "function") {
    return await (ctx as () => Ctx | Promise<Ctx>)();
  }
  return ctx;
}
