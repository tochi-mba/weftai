import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { bindProviderTools } from "../bind.js";
import { SAMPLE_PLAN, sampleCtx, sampleRuntime } from "../fixture.js";
import {
  azureDeploymentURL,
  azureFoundryURL,
  azureHeaders,
  handleChatCompletionsToolCalls,
  handleLegacyFunctionCall,
  handleResponsesFunctionCalls,
  openaiTools,
  PRESETS,
  realtimeFunctionCallOutput,
  resolveOpenAIHost,
  toAssistantsTools,
  toChatCompletionsTools,
  toLegacyFunctions,
  toRealtimeTools,
  toResponsesTools,
} from "./index.js";

const PLAN_JSON = JSON.stringify(SAMPLE_PLAN);

async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const server = createServer((req, res) => {
    void Promise.resolve(handler(req, res)).catch((error: unknown) => {
      res.statusCode = 500;
      res.end(error instanceof Error ? error.message : "error");
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected a TCP port");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

describe("openai Chat Completions and Responses", () => {
  it("wraps tools in the official nested function shape, including UTF-8 descriptions", async () => {
    const runtime = sampleRuntime();
    const tools = openaiTools(runtime, {
      ctx: sampleCtx,
      session: { id: "s" },
      tools: [{ name: "query_diagram", include: (op) => op.effects === "read" }],
    });
    expect(tools[0]).toMatchObject({
      type: "function",
      function: { name: "query_diagram" },
    });
    expect(tools[0]?.function.description).toContain("查找项目");
    expect(tools[0]?.function.parameters.type).toBe("object");
    expect("strict" in (tools[0] ?? {})).toBe(false);
    const messages = await handleChatCompletionsToolCalls(tools, [
      {
        id: "call_abc123",
        type: "function",
        function: { name: "query_diagram", arguments: PLAN_JSON },
      },
    ]);
    expect(messages).toEqual([
      expect.objectContaining({ role: "tool", tool_call_id: "call_abc123" }),
    ]);
    expect(messages[0]?.content).toContain("all (items): 1 matched");
  });

  it("accepts object arguments, parallel calls, streamed JSON fragments and unknown tools", async () => {
    const runtime = sampleRuntime();
    const tools = openaiTools(runtime, {
      ctx: sampleCtx,
      tools: [{ name: "query" }],
      strict: true,
    });
    expect(tools[0]?.strict).toBe(true);
    const streamed = ['{"steps":', '[{"id":"all","op":"items.find"}]}'].join("");
    const messages = await handleChatCompletionsToolCalls(tools, [
      { id: "c1", function: { name: "query", arguments: SAMPLE_PLAN } },
      { id: "c2", function: { name: "query", arguments: streamed } },
      { id: "c3", function: { name: "nope", arguments: "{}" } },
      { id: "c4", function: { name: "query", arguments: "{" } },
    ]);
    expect(messages[0]?.content).toContain("Alpha");
    expect(messages[1]?.content).toContain("Alpha");
    expect(messages[2]?.content).toContain("Unknown tool 'nope'");
    expect(messages[3]?.content).toContain("not valid JSON");
    const none = await handleChatCompletionsToolCalls(
      [],
      [{ id: "x", function: { name: "query", arguments: "{}" } }],
    );
    expect(none[0]?.content).toContain("(none)");
  });

  it("round-trips the deprecated functions array", async () => {
    const bound = bindProviderTools(sampleRuntime(), {
      ctx: sampleCtx,
      tools: [{ name: "query" }],
    });
    const fns = toLegacyFunctions(bound);
    const ok = await handleLegacyFunctionCall(fns, { name: "query", arguments: PLAN_JSON });
    expect(ok).toEqual({
      role: "function",
      name: "query",
      content: expect.stringContaining("Alpha"),
    });
    const missing = await handleLegacyFunctionCall(fns, { name: "nope", arguments: "{}" });
    expect(missing.content).toContain("Unknown function 'nope'");
    const bad = await handleLegacyFunctionCall(fns, { name: "query", arguments: "{" });
    expect(bad.content).toContain("not valid JSON");
  });

  it("emits flat Responses tools and function_call_output items", async () => {
    const runtime = sampleRuntime();
    const tools = openaiTools(runtime, {
      api: "responses",
      ctx: sampleCtx,
      tools: [{ name: "query" }],
    });
    expect(tools[0]).toMatchObject({ type: "function", name: "query", strict: true });
    expect(JSON.stringify(tools[0]?.parameters)).not.toContain("anyOf");
    const outputs = await handleResponsesFunctionCalls(tools, [
      { type: "function_call", call_id: "fc_1", name: "query", arguments: PLAN_JSON },
      { call_id: "fc_2", name: "nope", arguments: "{}" },
      { call_id: "fc_3", name: "query", arguments: "{" },
    ]);
    expect(outputs[0]).toEqual({
      type: "function_call_output",
      call_id: "fc_1",
      output: expect.stringContaining("Alpha"),
    });
    expect(outputs[1]?.output).toContain("Unknown tool 'nope'");
    expect(outputs[2]?.output).toContain("not valid JSON");
    const empty = await handleResponsesFunctionCalls(
      [],
      [{ call_id: "z", name: "q", arguments: "{}" }],
    );
    expect(empty[0]?.output).toContain("(none)");
    const loose = toResponsesTools(
      bindProviderTools(runtime, { ctx: sampleCtx, tools: [{ name: "q" }] }),
      {
        strict: false,
      },
    );
    expect(loose[0]?.strict).toBe(false);
    const defaults = toResponsesTools(
      bindProviderTools(runtime, { ctx: sampleCtx, tools: [{ name: "q" }] }),
    );
    expect(defaults[0]?.strict).toBe(true);
  });

  it("maps Assistants and Realtime tools onto the same handle", async () => {
    const bound = bindProviderTools(sampleRuntime(), {
      ctx: sampleCtx,
      tools: [{ name: "query" }],
    });
    expect(toAssistantsTools(bound)[0]?.type).toBe("function");
    const realtime = toRealtimeTools(bound);
    expect(realtime[0]?.name).toBe("query");
    const text = await realtime[0]?.handle(SAMPLE_PLAN);
    expect(text).toContain("Alpha");
    expect(realtimeFunctionCallOutput("call_1", "ok")).toEqual({
      type: "function_call_output",
      call_id: "call_1",
      output: "ok",
    });
  });

  it("resolves host extras from the catalog and rejects models that cannot call tools", () => {
    const qwen = resolveOpenAIHost({ ...PRESETS.qwenIntl, model: "qwen-plus" });
    expect(qwen.api).toBe("chat.completions");
    expect(qwen.baseURL).toContain("dashscope-intl");
    expect(qwen.extraBody).toEqual({ enable_thinking: false });
    const bare = resolveOpenAIHost({ api: "responses" });
    expect(bare.dialect).toBe("openai-strict");
    expect(bare.capability).toBeUndefined();
    expect(() =>
      openaiTools(sampleRuntime(), {
        model: "gpt-6-astra",
        api: "chat.completions",
        ctx: sampleCtx,
        tools: [{ name: "q" }],
      }),
    ).toThrow(/Responses/);
    const ok = openaiTools(sampleRuntime(), {
      model: "gpt-4o",
      ctx: sampleCtx,
      tools: [{ name: "query" }],
    });
    expect(ok[0]?.function.name).toBe("query");
    expect(() => resolveOpenAIHost({ ...PRESETS.qwen, model: "qwen-plus", stream: true })).toThrow(
      /streamTools: false/,
    );
    const overridden = resolveOpenAIHost({
      model: "gpt-4o",
      extraBody: { foo: 1 },
      baseURL: "http://localhost/v1",
      dialect: "union",
    });
    expect(overridden.extraBody).toEqual({ foo: 1 });
    expect(overridden.baseURL).toBe("http://localhost/v1");
    expect(overridden.dialect).toBe("union");
  });

  it("documents Azure construction and every preset's family", () => {
    expect(azureHeaders("k")).toEqual({ "api-key": "k" });
    expect(azureDeploymentURL("my", "gpt")).toContain("my.openai.azure.com");
    expect(azureFoundryURL("my")).toContain("/openai/v1/");
    expect(PRESETS.qwen.baseURLIntl).toContain("dashscope-intl");
    expect(PRESETS.kimi.baseURLIntl).toContain("moonshot.ai");
    expect(PRESETS.minimax.baseURLIntl).toContain("minimax.io");
    expect(PRESETS.ark.modelIdKind).toBe("endpoint");
    expect(PRESETS.sensenova.provider).toBe("sensenova");
    for (const preset of Object.values(PRESETS)) {
      expect(preset.provider.length).toBeGreaterThan(0);
      expect(preset.api.length).toBeGreaterThan(0);
    }
  });

  it("round-trips a Chat Completions HTTP mock", async () => {
    const tools = openaiTools(sampleRuntime(), { ctx: sampleCtx, tools: [{ name: "query" }] });
    await withServer(
      async (req, res) => {
        const body = JSON.parse(await readBody(req)) as {
          tools: { type: string; function: { name: string } }[];
        };
        expect(req.url).toBe("/chat/completions");
        expect(body.tools[0]).toMatchObject({ type: "function", function: { name: "query" } });
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      id: "call_1",
                      type: "function",
                      function: { name: "query", arguments: PLAN_JSON },
                    },
                  ],
                },
              },
            ],
          }),
        );
      },
      async (url) => {
        const response = await fetch(`${url}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o",
            tools: toChatCompletionsTools(
              bindProviderTools(sampleRuntime(), { ctx: sampleCtx, tools: [{ name: "query" }] }),
            ).map(({ handle: _h, ...def }) => def),
            messages: [{ role: "user", content: "go" }],
          }),
        });
        const payload = (await response.json()) as {
          choices: [
            { message: { tool_calls: Parameters<typeof handleChatCompletionsToolCalls>[1] } },
          ];
        };
        const out = await handleChatCompletionsToolCalls(
          tools,
          payload.choices[0]?.message.tool_calls ?? [],
        );
        expect(out[0]?.content).toContain("Alpha");
      },
    );
  });

  it("round-trips a Responses HTTP mock", async () => {
    const tools = openaiTools(sampleRuntime(), {
      api: "responses",
      ctx: sampleCtx,
      tools: [{ name: "query" }],
    });
    await withServer(
      async (req, res) => {
        const body = JSON.parse(await readBody(req)) as { tools: { type: string; name: string }[] };
        expect(req.url).toBe("/responses");
        expect(body.tools[0]).toMatchObject({ type: "function", name: "query" });
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            output: [
              {
                type: "function_call",
                call_id: "fc_1",
                name: "query",
                arguments: PLAN_JSON,
              },
            ],
          }),
        );
      },
      async (url) => {
        const response = await fetch(`${url}/responses`, {
          method: "POST",
          body: JSON.stringify({
            model: "gpt-4o",
            tools: tools.map(({ handle: _h, ...def }) => def),
          }),
        });
        const payload = (await response.json()) as {
          output: Parameters<typeof handleResponsesFunctionCalls>[1];
        };
        const out = await handleResponsesFunctionCalls(tools, payload.output);
        expect(out[0]).toEqual({
          type: "function_call_output",
          call_id: "fc_1",
          output: expect.stringContaining("Alpha"),
        });
      },
    );
  });
});
