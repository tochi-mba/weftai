import { randomUUID } from "node:crypto";
import type { AnyOperation, Runtime } from "weftai";
import { type BoundTool, bindTool, type SchemaDialect } from "weftai/adapter";

export interface ProviderToolSpec<Ctx> {
  readonly name: string;
  readonly description?: string | undefined;
  readonly include?: ((operation: AnyOperation<Ctx>) => boolean) | undefined;
  readonly allowWrites?: boolean | undefined;
}

export interface ProviderToolsOptions<Ctx> {
  readonly ctx: Ctx | (() => Ctx | Promise<Ctx>);
  readonly tools: readonly ProviderToolSpec<Ctx>[];
  readonly session?: { readonly id: string } | undefined;
  readonly dialect?: SchemaDialect | undefined;
  readonly strict?: boolean | undefined;
}

export function bindProviderTools<Ctx>(
  runtime: Runtime<Ctx>,
  options: ProviderToolsOptions<Ctx>,
): BoundTool[] {
  const sessionId = options.session?.id ?? randomUUID();
  return options.tools.map((spec) =>
    bindTool(
      runtime,
      {
        name: spec.name,
        description: spec.description,
        include: spec.include,
        allowWrites: spec.allowWrites,
        dialect: options.dialect,
        strict: options.strict,
        onInvalid: "text",
      },
      { ctx: options.ctx, sessionId },
    ),
  );
}

export function findBound(tools: readonly BoundTool[], name: string): BoundTool | undefined {
  return tools.find((tool) => tool.name === name);
}
