import { z } from "zod";
import { REF_SYNTAX_RULE, REF_TOLERANT_PATTERN } from "../refs/syntax.js";
import type { Collection, CollectionType } from "./types.js";

declare const REF_TARGET: unique symbol;

/** Phantom brand carried by the model-facing string so handlers see the resolved value. */
export interface RefTarget<R> {
  readonly [REF_TARGET]: R;
}

/** What the model writes (`"$owned[2]"`), typed so `Resolved<>` can swap in the collection. */
export type Ref<T = unknown> = string & RefTarget<Collection<T>>;

/** Maps every `Ref<T>` inside a parsed input to the `Collection<T>` the handler receives. */
export type Resolved<T> =
  T extends RefTarget<infer R>
    ? R
    : T extends readonly (infer U)[]
      ? readonly Resolved<U>[]
      : T extends object
        ? { [K in keyof T]: Resolved<T[K]> }
        : T;

export interface RefMeta {
  readonly kind: "ref";
  /** The collection a reference must resolve to, or `undefined` to accept any collection. */
  readonly target: CollectionType<unknown, unknown> | undefined;
}

/** Private metadata, keyed by schema identity; nothing here leaks into JSON Schema output. */
const refSchemas = new WeakMap<z.ZodType, RefMeta>();

export interface RefOptions {
  readonly description?: string | undefined;
}

/**
 * An input field that references an earlier step's result. In the model-facing schema it is a
 * string matching the reference grammar; in the handler it is the resolved `Collection`.
 */
export function ref<T, Ctx>(
  target: CollectionType<T, Ctx>,
  options?: RefOptions,
): z.ZodType<Ref<T>>;
export function ref(options?: RefOptions): z.ZodType<Ref<unknown>>;
export function ref(
  targetOrOptions?: CollectionType<unknown, unknown> | RefOptions,
  maybeOptions?: RefOptions,
): z.ZodType<Ref<unknown>> {
  const target = isCollectionType(targetOrOptions) ? targetOrOptions : undefined;
  const options = isCollectionType(targetOrOptions) ? maybeOptions : targetOrOptions;
  const what =
    target === undefined ? "an earlier step's result" : `an earlier step's ${target.name} result`;
  const description =
    options?.description ??
    `Reference to ${what}: "$stepId", or "$stepId[1,3]" for specific positions.`;
  const schema = z
    .string()
    .regex(REF_TOLERANT_PATTERN, { message: REF_SYNTAX_RULE })
    .describe(description);
  refSchemas.set(schema, { kind: "ref", target });
  return schema as unknown as z.ZodType<Ref<unknown>>;
}

export function refMeta(schema: z.ZodType): RefMeta | undefined {
  return refSchemas.get(schema);
}

export function isRefSchema(schema: z.ZodType): boolean {
  return refSchemas.has(schema);
}

function isCollectionType(value: unknown): value is CollectionType<unknown, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "collection" &&
    typeof (value as { name?: unknown }).name === "string"
  );
}
