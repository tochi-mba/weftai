import type { z } from "zod";
import { DefinitionError } from "../errors.js";

/** A named, readable property of a collection item, used by filters, details and grouping. */
export interface FieldSpec<T = unknown> {
  readonly name: string;
  /** Everyday names the model may use instead; an exact field name always wins over an alias. */
  readonly aliases?: readonly string[] | undefined;
  readonly description?: string | undefined;
  get(item: T): unknown;
}

/**
 * Describes a kind of entity an operation can return: how items are named for the model, how
 * they are identified, and which fields they expose. Method signatures are used deliberately so a
 * `CollectionType<Node, DiagramContext>` is assignable to `CollectionType<unknown, unknown>`.
 */
export interface CollectionType<T = unknown, Ctx = unknown> {
  readonly kind: "collection";
  /** Short plural name shown after step ids: `owned (nodes): 3 matched`. */
  readonly name: string;
  readonly item: z.ZodType<T>;
  readonly description: string | undefined;
  /** The label the model sees for an item. Never an internal identifier. */
  label(item: T): string;
  /** Identity used for de-duplication; defaults to the label. */
  key(item: T): string;
  /** Field catalogue derived from the live context, or `undefined` when items have no fields. */
  fields?(ctx: Ctx): readonly FieldSpec<T>[];
}

export interface CollectionOptions<T, Ctx> {
  label(item: T): string;
  key?(item: T): string;
  fields?(ctx: Ctx): readonly FieldSpec<T>[];
  readonly description?: string | undefined;
}

const COLLECTION_NAME = /^[a-z][a-zA-Z0-9]*$/;

export function collection<T, Ctx = unknown>(
  name: string,
  item: z.ZodType<T>,
  options: CollectionOptions<T, Ctx>,
): CollectionType<T, Ctx> {
  if (!COLLECTION_NAME.test(name)) {
    throw new DefinitionError(
      `Collection name '${name}' is invalid; use a short lowerCamelCase plural such as 'nodes'.`,
    );
  }
  const type: CollectionType<T, Ctx> = {
    kind: "collection",
    name,
    item,
    description: options.description,
    label: options.label,
    key: options.key ?? options.label,
  };
  if (options.fields !== undefined) {
    return { ...type, fields: options.fields };
  }
  return type;
}

/** A materialised result: an ordered set of items of one collection type. */
export interface Collection<T = unknown> {
  readonly type: string;
  readonly items: readonly T[];
  readonly count: number;
}

export function makeCollection<T>(
  type: CollectionType<T, never>,
  items: readonly T[],
): Collection<T>;
export function makeCollection<T>(typeName: string, items: readonly T[]): Collection<T>;
export function makeCollection<T>(
  type: CollectionType<T, never> | string,
  items: readonly T[],
): Collection<T> {
  const name = typeof type === "string" ? type : type.name;
  const frozen = Object.freeze([...items]);
  return { type: name, items: frozen, count: frozen.length };
}

/** A single value: a number, a string, a record, anything Zod can describe. */
export interface ValueType<T = unknown> {
  readonly kind: "value";
  readonly schema: z.ZodType<T>;
  readonly description: string | undefined;
}

export function value<T>(schema: z.ZodType<T>, options?: { description?: string }): ValueType<T> {
  return { kind: "value", schema, description: options?.description };
}

/** Grouped counts, most common first, as produced by a count-by operation. */
export interface GroupsType {
  readonly kind: "groups";
  readonly description: string | undefined;
}

export interface Group {
  readonly key: string;
  readonly count: number;
}

export function groups(options?: { description?: string }): GroupsType {
  return { kind: "groups", description: options?.description };
}

export type ResultType = CollectionType<unknown, unknown> | ValueType<unknown> | GroupsType;

/** The raw data a handler returns for a given result type. */
export type OutputData<O extends ResultType> =
  O extends CollectionType<infer T, infer _C>
    ? readonly T[]
    : O extends ValueType<infer V>
      ? V
      : O extends GroupsType
        ? readonly Group[]
        : never;

const STEP_OUTPUT = Symbol.for("agentweft.stepOutput");

/**
 * A handler return value carrying provenance: the entities that produced an aggregate. A count
 * step displays a number but still registers the items it counted, so they can be referenced.
 */
export interface StepOutput<D> {
  readonly [STEP_OUTPUT]: true;
  readonly data: D;
  readonly sources: Collection<unknown> | undefined;
}

export function withSources<D, S>(
  data: D,
  type: CollectionType<S, never>,
  items: readonly S[],
): StepOutput<D> {
  return { [STEP_OUTPUT]: true, data, sources: makeCollection(type, items) };
}

export function isStepOutput(value: unknown): value is StepOutput<unknown> {
  return typeof value === "object" && value !== null && STEP_OUTPUT in value;
}
