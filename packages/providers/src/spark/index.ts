import { createHmac } from "node:crypto";
import type { Runtime } from "weftai";
import { type BoundTool, parseToolArguments, requireCapability } from "weftai/adapter";
import { bindProviderTools, type ProviderToolsOptions } from "../bind.js";

export interface SparkFunction {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  handle(input: unknown): Promise<string>;
}

export interface SparkFunctionCall {
  readonly name: string;
  readonly arguments: unknown;
}

export interface SparkFunctionResponse {
  readonly name: string;
  readonly content: string;
}

export function toSparkFunctions(bound: readonly BoundTool[]): {
  readonly function_definition: SparkFunction[];
} {
  return {
    function_definition: bound.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
      handle: (input: unknown) => tool.handle(input),
    })),
  };
}

export interface SparkToolsOptions<Ctx> extends ProviderToolsOptions<Ctx> {
  readonly model?: string | undefined;
}

export function sparkTools<Ctx>(
  runtime: Runtime<Ctx>,
  options: SparkToolsOptions<Ctx>,
): ReturnType<typeof toSparkFunctions> {
  if (options.model !== undefined) {
    requireCapability(options.model, { provider: "spark", api: "spark.hmac" });
  }
  return toSparkFunctions(
    bindProviderTools(runtime, {
      ...options,
      dialect: options.dialect ?? "union",
    }),
  );
}

export interface SparkAuthInput {
  readonly host: string;
  readonly path: string;
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly date: string;
  readonly method?: string | undefined;
}

export function sparkAuthUrl(input: SparkAuthInput): string {
  const method = input.method ?? "GET";
  const signatureOrigin = `host: ${input.host}\ndate: ${input.date}\n${method} ${input.path} HTTP/1.1`;
  const signature = createHmac("sha256", input.apiSecret)
    .update(signatureOrigin, "utf8")
    .digest("base64");
  const authorizationOrigin = `api_key="${input.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin, "utf8").toString("base64");
  const params = new URLSearchParams({
    authorization,
    date: input.date,
    host: input.host,
  });
  return `wss://${input.host}${input.path}?${params.toString()}`;
}

export async function handleSparkFunctionCalls(
  tools: readonly SparkFunction[],
  calls: readonly SparkFunctionCall[],
): Promise<SparkFunctionResponse[]> {
  const results: SparkFunctionResponse[] = [];
  for (const call of calls) {
    const tool = tools.find((candidate) => candidate.name === call.name);
    const parsed = parseToolArguments(call.arguments);
    const content =
      tool === undefined
        ? `Unknown tool '${call.name}'. Available tools: ${tools.map((item) => item.name).join(", ") || "(none)"}.`
        : parsed.ok
          ? await tool.handle(parsed.value)
          : parsed.message;
    results.push({ name: call.name, content });
  }
  return results;
}
