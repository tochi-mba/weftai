import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { bindProviderTools } from "../bind.js";
import { SAMPLE_PLAN, sampleCtx, sampleRuntime } from "../fixture.js";
import {
  googleEndpoint,
  googleTools,
  handleGeminiFunctionCalls,
  toFunctionResponse,
  toGenerateContentTools,
  toInteractionsTools,
} from "./index.js";

describe("Gemini generateContent and Interactions", () => {
  it("emits functionDeclarations and functionResponse parts", async () => {
    const tools = googleTools(sampleRuntime(), {
      model: "gemini-2.5-flash",
      ctx: sampleCtx,
      tools: [{ name: "query" }],
    });
    expect(tools[0]?.functionDeclarations[0]?.name).toBe("query");
    expect(JSON.stringify(tools[0]?.functionDeclarations[0]?.parameters)).not.toContain(
      "additionalProperties",
    );
    const decls = tools[0]?.functionDeclarations ?? [];
    const responses = await handleGeminiFunctionCalls(decls, [
      { name: "query", args: SAMPLE_PLAN },
      { name: "query", arguments: JSON.stringify(SAMPLE_PLAN), id: "c2" },
      { name: "nope", args: {} },
      { name: "query", args: "{" },
    ]);
    expect(responses[0]?.functionResponse.response.result).toContain("Alpha");
    expect(responses[1]?.functionResponse.id).toBe("c2");
    expect(responses[2]?.functionResponse.response.result).toContain("Unknown tool 'nope'");
    expect(responses[3]?.functionResponse.response.result).toContain("not valid JSON");
    const empty = await handleGeminiFunctionCalls([], [{ name: "q", args: {} }]);
    expect(empty[0]?.functionResponse.response.result).toContain("(none)");
  });

  it("uses uppercase Vertex types and a distinct Interactions wire format", async () => {
    const vertex = googleTools(sampleRuntime(), {
      vertex: true,
      ctx: sampleCtx,
      tools: [{ name: "query" }],
    });
    expect(vertex[0]?.functionDeclarations[0]?.parameters.type).toBe("OBJECT");
    const interactions = googleTools(sampleRuntime(), {
      api: "interactions",
      model: "gemini-3-flash",
      ctx: sampleCtx,
      tools: [{ name: "query" }],
    });
    expect(interactions[0]).toMatchObject({ type: "function", name: "query" });
    expect(await interactions[0]?.handle(SAMPLE_PLAN)).toContain("Alpha");
    expect(googleEndpoint({ kind: "ai-studio" }, "gemini-2.5-flash")).toContain(
      "generativelanguage.googleapis.com",
    );
    expect(
      googleEndpoint(
        { kind: "vertex", project: "p", location: "europe-west1" },
        "gemini-2.5-flash",
      ),
    ).toContain("projects/p/locations/europe-west1");
    expect(googleEndpoint({ kind: "vertex" }, "gemini-2.5-flash")).toContain("PROJECT");
    expect(toFunctionResponse("q", "ok").functionResponse).toEqual({
      name: "q",
      response: { result: "ok" },
    });
    const bound = bindProviderTools(sampleRuntime(), { ctx: sampleCtx, tools: [{ name: "q" }] });
    expect(toGenerateContentTools(bound)[0]?.functionDeclarations).toHaveLength(1);
    expect(toInteractionsTools(bound)[0]?.type).toBe("function");
  });

  it("rejects models the catalog does not list for Gemini", () => {
    expect(() =>
      googleTools(sampleRuntime(), { model: "gpt-4o", ctx: sampleCtx, tools: [{ name: "q" }] }),
    ).toThrow(/Unknown model/);
  });

  it("round-trips a generateContent HTTP mock", async () => {
    const tools = googleTools(sampleRuntime(), { ctx: sampleCtx, tools: [{ name: "query" }] });
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      void (async () => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          tools: { functionDeclarations: { name: string }[] }[];
        };
        expect(body.tools[0]?.functionDeclarations[0]?.name).toBe("query");
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ functionCall: { name: "query", args: SAMPLE_PLAN } }],
                },
              },
            ],
          }),
        );
      })();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("expected a TCP port");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/generateContent`, {
        method: "POST",
        body: JSON.stringify({ tools }),
      });
      const payload = (await response.json()) as {
        candidates: [{ content: { parts: [{ functionCall: { name: string; args: unknown } }] } }];
      };
      const out = await handleGeminiFunctionCalls(
        tools[0]?.functionDeclarations ?? [],
        payload.candidates[0]?.content.parts.map((part) => part.functionCall) ?? [],
      );
      expect(out[0]?.functionResponse.response.result).toContain("Alpha");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
