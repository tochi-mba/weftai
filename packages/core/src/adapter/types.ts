import type { AnyOperation } from "../operation.js";
import type { JsonSchema } from "../schema/json.js";

/** Wire-format family a host speaks for tool calling. */
export type FamilyId =
  | "chat.completions"
  | "responses"
  | "anthropic.messages"
  | "anthropic.toolRunner"
  | "gemini.generateContent"
  | "gemini.interactions"
  | "bedrock.converse"
  | "ollama.chat"
  | "cohere.chat"
  | "dashscope.native"
  | "hunyuan.tc3"
  | "spark.hmac"
  | "mcp";

/**
 * How to compile a plan JSON Schema for a host. `openai-strict` falls back to `loose` when a
 * union would emit `anyOf`, which OpenAI strict mode rejects.
 */
export type SchemaDialect =
  | "union"
  | "loose"
  | "openai-strict"
  | "gemini-openapi"
  | "gemini-vertex"
  | "anthropic"
  | "bedrock-nova";

export type ToolsSupport = "yes" | "no" | "json-mode-only" | "unknown";

export type ArgumentEncoding = "string" | "object";

export type Region = "cn" | "intl";

export type ModelIdKind = "name" | "endpoint";

export interface Capability {
  readonly provider: string;
  readonly api: FamilyId;
  readonly modelPattern: string;
  readonly tools: ToolsSupport;
  readonly schemaDialect: SchemaDialect;
  readonly arguments: ArgumentEncoding;
  readonly parallel: boolean;
  readonly strictDefault: boolean;
  readonly auth: string;
  readonly notes: string;
  readonly baseURL?: string | undefined;
  readonly baseURLIntl?: string | undefined;
  readonly region?: Region | undefined;
  readonly extraBody?: Readonly<Record<string, unknown>> | undefined;
  readonly streamTools?: boolean | undefined;
  readonly modelIdKind?: ModelIdKind | undefined;
}

export interface BindToolSpec<Ctx> {
  readonly name: string;
  readonly description?: string | undefined;
  readonly include?: ((operation: AnyOperation<Ctx>) => boolean) | undefined;
  readonly allowWrites?: boolean | undefined;
  readonly dialect?: SchemaDialect | undefined;
  readonly strict?: boolean | undefined;
  /** `throw` keeps the Anthropic 0.1.1 parse contract; new adapters use `text`. */
  readonly onInvalid?: "throw" | "text" | undefined;
}

export interface BoundHandleResult {
  readonly text: string;
  readonly ok: boolean;
}

export interface BoundTool {
  readonly name: string;
  readonly description: string;
  readonly schema: JsonSchema;
  readonly dialect: SchemaDialect;
  handle(input: unknown): Promise<string>;
  execute(input: unknown): Promise<BoundHandleResult>;
}

export interface BindContext<Ctx> {
  readonly ctx: Ctx | (() => Ctx | Promise<Ctx>);
  readonly sessionId: string;
}
