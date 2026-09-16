import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { bindProviderTools } from "../bind.js";
import { SAMPLE_PLAN, sampleCtx, sampleRuntime } from "../fixture.js";
import {
  assembleOllamaStream,
  handleOllamaToolCalls,
  ollamaTools,
  parseOllamaChatPayload,
  toOllamaTools,
} from "./index.js";

async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const server = createServer((req, res) => {
    void handler(req, res).catch((error: unknown) => {
      res.statusCode = 500;
      res.end(error instanceof Error ? error.message : "error");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected a TCP port");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe("Ollama /api/chat", () => {
  it("uses object arguments and tool_name on results", async () => {
    const tools = ollamaTools(sampleRuntime(), {
      model: "llama3.2",
      ctx: sampleCtx,
      tools: [{ name: "query" }],
    });
    expect(tools[0]?.type).toBe("function");
    const messages = await handleOllamaToolCalls(tools, [
      { function: { name: "query", arguments: SAMPLE_PLAN } },
      { function: { name: "query", arguments: JSON.stringify(SAMPLE_PLAN) } },
      { function: { name: "nope", arguments: {} } },
      { function: { name: "query", arguments: "{" } },
    ]);
    expect(messages[0]).toEqual({
      role: "tool",
      tool_name: "query",
      content: expect.stringContaining("Alpha"),
    });
    expect(messages[1]?.content).toContain("Alpha");
    expect(messages[2]?.content).toContain("Unknown tool 'nope'");
    expect(messages[3]?.content).toContain("not valid JSON");
    const none = await handleOllamaToolCalls([], [{ function: { name: "q", arguments: {} } }]);
    expect(none[0]?.content).toContain("(none)");
  });

  it("assembles thinking, content and tool_calls from a stream", () => {
    expect(parseOllamaChatPayload("nope")).toEqual({
      thinking: "",
      content: "",
      toolCalls: [],
      done: false,
    });
    const assembled = assembleOllamaStream([
      { message: { thinking: "hmm" } },
      { message: { content: "hi" } },
      {
        message: {
          tool_calls: [
            { function: { name: "query", arguments: SAMPLE_PLAN } },
            { function: { name: 1 } },
            "skip",
          ],
        },
      },
      { tool_calls: [{ function: { name: "query", arguments: {} } }], done: true },
      { message: { content: "!" }, tool_calls: [{ function: { name: "query", arguments: {} } }] },
    ]);
    expect(assembled.thinking).toBe("hmm");
    expect(assembled.content).toBe("hi!");
    expect(assembled.toolCalls).toHaveLength(3);
  });

  it("rejects tags that cannot call tools", () => {
    expect(() =>
      ollamaTools(sampleRuntime(), { model: "llava", ctx: sampleCtx, tools: [{ name: "q" }] }),
    ).toThrow(/ollama.com\/search\?c=tool/);
    expect(
      toOllamaTools(
        bindProviderTools(sampleRuntime(), { ctx: sampleCtx, tools: [{ name: "q" }] }),
      )[0]?.function.name,
    ).toBe("q");
  });

  it("round-trips a native /api/chat HTTP mock", async () => {
    const tools = ollamaTools(sampleRuntime(), { ctx: sampleCtx, tools: [{ name: "query" }] });
    await withServer(
      async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { tools: unknown[] };
        expect(req.url).toBe("/api/chat");
        expect(body.tools).toHaveLength(1);
        res.setHeader("content-type", "application/x-ndjson");
        res.write(`${JSON.stringify({ message: { thinking: "plan" } })}\n`);
        res.write(
          `${JSON.stringify({
            message: {
              tool_calls: [{ function: { name: "query", arguments: SAMPLE_PLAN } }],
            },
            done: true,
          })}\n`,
        );
        res.end();
      },
      async (url) => {
        const response = await fetch(`${url}/api/chat`, {
          method: "POST",
          body: JSON.stringify({ model: "llama3.2", tools, stream: true }),
        });
        const lines = (await response.text())
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as unknown);
        const assembled = assembleOllamaStream(lines);
        expect(assembled.thinking).toBe("plan");
        const out = await handleOllamaToolCalls(tools, assembled.toolCalls);
        expect(out[0]?.tool_name).toBe("query");
        expect(out[0]?.content).toContain("Alpha");
      },
    );
  });
});
