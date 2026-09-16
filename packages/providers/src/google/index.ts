import type { Runtime } from "weftai";
import {
  type BoundTool,
  parseToolArguments,
  requireCapability,
  type SchemaDialect,
} from "weftai/adapter";
import { bindProviderTools, type ProviderToolsOptions } from "../bind.js";

export interface GeminiFunctionDeclaration {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  handle(input: unknown): Promise<string>;
}

export interface GenerateContentTool {
  readonly functionDeclarations: readonly GeminiFunctionDeclaration[];
}

export interface InteractionsFunctionTool {
  readonly type: "function";
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  handle(input: unknown): Promise<string>;
}

export interface GeminiFunctionCall {
  readonly name: string;
  readonly args?: unknown;
  readonly arguments?: unknown;
  readonly id?: string | undefined;
}

export interface GeminiFunctionResponse {
  readonly functionResponse: {
    readonly name: string;
    readonly response: { readonly result: string };
    readonly id?: string | undefined;
  };
}

export interface GoogleAuth {
  readonly kind: "ai-studio" | "vertex";
  readonly project?: string | undefined;
  readonly location?: string | undefined;
}

export function googleEndpoint(auth: GoogleAuth, model: string): string {
  if (auth.kind === "vertex") {
    const project = auth.project ?? "PROJECT";
    const location = auth.location ?? "us-central1";
    return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
  }
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export function toGenerateContentTools(bound: readonly BoundTool[]): GenerateContentTool[] {
  return [
    {
      functionDeclarations: bound.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.schema,
        handle: (input: unknown) => tool.handle(input),
      })),
    },
  ];
}

export function toInteractionsTools(bound: readonly BoundTool[]): InteractionsFunctionTool[] {
  return bound.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.schema,
    handle: (input) => tool.handle(input),
  }));
}

export function toFunctionResponse(
  name: string,
  result: string,
  id?: string,
): GeminiFunctionResponse {
  const body = { name, response: { result } };
  return {
    functionResponse: id === undefined ? body : { ...body, id },
  };
}

export interface GoogleToolsOptions<Ctx> extends ProviderToolsOptions<Ctx> {
  readonly api?: "generateContent" | "interactions" | undefined;
  readonly model?: string | undefined;
  readonly vertex?: boolean | undefined;
}

export function googleTools<Ctx>(
  runtime: Runtime<Ctx>,
  options: GoogleToolsOptions<Ctx> & { readonly api: "interactions" },
): InteractionsFunctionTool[];
export function googleTools<Ctx>(
  runtime: Runtime<Ctx>,
  options: GoogleToolsOptions<Ctx>,
): GenerateContentTool[];
export function googleTools<Ctx>(
  runtime: Runtime<Ctx>,
  options: GoogleToolsOptions<Ctx>,
): GenerateContentTool[] | InteractionsFunctionTool[] {
  if (options.model !== undefined) {
    requireCapability(options.model, {
      provider: "google",
      api: options.api === "interactions" ? "gemini.interactions" : "gemini.generateContent",
    });
  }
  const dialect: SchemaDialect =
    options.dialect ?? (options.vertex === true ? "gemini-vertex" : "gemini-openapi");
  const bound = bindProviderTools(runtime, { ...options, dialect });
  return options.api === "interactions"
    ? toInteractionsTools(bound)
    : toGenerateContentTools(bound);
}

export async function handleGeminiFunctionCalls(
  tools: readonly GeminiFunctionDeclaration[],
  calls: readonly GeminiFunctionCall[],
): Promise<GeminiFunctionResponse[]> {
  const results: GeminiFunctionResponse[] = [];
  for (const call of calls) {
    const tool = tools.find((candidate) => candidate.name === call.name);
    if (tool === undefined) {
      results.push(
        toFunctionResponse(
          call.name,
          `Unknown tool '${call.name}'. Available tools: ${tools.map((item) => item.name).join(", ") || "(none)"}.`,
          call.id,
        ),
      );
      continue;
    }
    const parsed = parseToolArguments(call.args ?? call.arguments);
    const text = parsed.ok ? await tool.handle(parsed.value) : parsed.message;
    results.push(toFunctionResponse(call.name, text, call.id));
  }
  return results;
}
