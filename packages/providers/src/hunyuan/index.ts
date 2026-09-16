import { createHash, createHmac } from "node:crypto";
import type { Runtime } from "weftai";
import { type BoundTool, parseToolArguments, requireCapability } from "weftai/adapter";
import { bindProviderTools, type ProviderToolsOptions } from "../bind.js";

export interface HunyuanFunction {
  readonly Type: "function";
  readonly Function: {
    readonly Name: string;
    readonly Description: string;
    readonly Parameters: string;
  };
  handle(input: unknown): Promise<string>;
}

export interface HunyuanToolCall {
  readonly Id?: string | undefined;
  readonly Function: { readonly Name: string; readonly Arguments: unknown };
}

export interface HunyuanToolMessage {
  readonly Role: "tool";
  readonly ToolCallId: string;
  readonly Content: string;
}

export function toHunyuanTools(bound: readonly BoundTool[]): {
  readonly Tools: HunyuanFunction[];
  readonly ToolChoice: "auto";
} {
  return {
    ToolChoice: "auto",
    Tools: bound.map((tool) => ({
      Type: "function",
      Function: {
        Name: tool.name,
        Description: tool.description,
        Parameters: JSON.stringify(tool.schema),
      },
      handle: (input: unknown) => tool.handle(input),
    })),
  };
}

export interface HunyuanToolsOptions<Ctx> extends ProviderToolsOptions<Ctx> {
  readonly model?: string | undefined;
}

export function hunyuanTools<Ctx>(
  runtime: Runtime<Ctx>,
  options: HunyuanToolsOptions<Ctx>,
): ReturnType<typeof toHunyuanTools> {
  if (options.model !== undefined) {
    requireCapability(options.model, { provider: "hunyuan", api: "hunyuan.tc3" });
  }
  return toHunyuanTools(
    bindProviderTools(runtime, {
      ...options,
      dialect: options.dialect ?? "union",
    }),
  );
}

export interface Tc3SignInput {
  readonly secretId: string;
  readonly secretKey: string;
  readonly payload: string;
  readonly timestamp: number;
  readonly region?: string | undefined;
  readonly service?: string | undefined;
  readonly action?: string | undefined;
  readonly host?: string | undefined;
}

export interface Tc3Authorization {
  readonly authorization: string;
  readonly hashedPayload: string;
  readonly credentialScope: string;
  readonly date: string;
}

export function hunyuanAuthorization(input: Tc3SignInput): Tc3Authorization {
  const service = input.service ?? "hunyuan";
  const host = input.host ?? "hunyuan.tencentcloudapi.com";
  const region = input.region ?? "ap-beijing";
  const date = new Date(input.timestamp * 1000).toISOString().slice(0, 10);
  const hashedPayload = sha256Hex(input.payload);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${(input.action ?? "ChatCompletions").toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;
  const credentialScope = `${date}/${region}/${service}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${input.timestamp}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;
  const secretDate = hmac(`TC3${input.secretKey}`, date);
  const secretRegion = hmac(secretDate, region);
  const secretService = hmac(secretRegion, service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = createHmac("sha256", secretSigning).update(stringToSign, "utf8").digest("hex");
  const authorization = `TC3-HMAC-SHA256 Credential=${input.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { authorization, hashedPayload, credentialScope, date };
}

export async function handleHunyuanToolCalls(
  tools: readonly HunyuanFunction[],
  calls: readonly HunyuanToolCall[],
): Promise<HunyuanToolMessage[]> {
  const results: HunyuanToolMessage[] = [];
  for (const [index, call] of calls.entries()) {
    const tool = tools.find((candidate) => candidate.Function.Name === call.Function.Name);
    const parsed = parseToolArguments(call.Function.Arguments);
    const content =
      tool === undefined
        ? `Unknown tool '${call.Function.Name}'. Available tools: ${tools.map((item) => item.Function.Name).join(", ") || "(none)"}.`
        : parsed.ok
          ? await tool.handle(parsed.value)
          : parsed.message;
    results.push({
      Role: "tool",
      ToolCallId: call.Id ?? `call_${index}`,
      Content: content,
    });
  }
  return results;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}
