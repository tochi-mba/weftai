import type { z } from "zod";
import { type ParsedRef, parseRef } from "../refs/syntax.js";
import { type RefMeta, refMeta } from "./ref.js";

export type Path = readonly (string | number)[];

/** One reference found in a parsed input, with where it sits and what it must resolve to. */
export type RefSite = {
  readonly path: Path;
  readonly text: string;
  readonly meta: RefMeta;
} & (
  | { readonly parsed: ParsedRef; readonly error: undefined }
  | { readonly parsed: undefined; readonly error: string }
);

/** A string written as a reference in a field that does not take one. */
export interface PlainRefSite {
  readonly path: Path;
  readonly text: string;
  readonly ref: ParsedRef;
}

const MAX_DEPTH = 32;

/** Walks a parsed value alongside its schema and collects every reference site, in order. */
export function collectRefs(schema: z.ZodType, value: unknown): RefSite[] {
  const sites: RefSite[] = [];
  for (const [leaf, found, path] of leaves(schema, value, [], 0)) {
    const meta = refMeta(leaf);
    if (meta === undefined || typeof found !== "string") continue;
    const parsed = parseRef(found);
    sites.push(
      parsed.ok
        ? { path, text: found, parsed: parsed.ref, error: undefined, meta }
        : { path, text: found, parsed: undefined, error: parsed.message, meta },
    );
  }
  return sites;
}

/**
 * Every string written as a reference in a field that does not take one, with its path.
 *
 * Such a string reaches the operation as written, because plain fields are never resolved: a
 * plan that puts `$find` there meant the result and would pass the text instead.
 */
export function collectPlainRefs(schema: z.ZodType, value: unknown): PlainRefSite[] {
  const sites = new Map<string, PlainRefSite>();
  for (const [leaf, found, path] of leaves(schema, value, [], 0)) {
    if (refMeta(leaf) !== undefined) continue;
    for (const [where, text] of strings(found, path, 0)) {
      const parsed = parseRef(text);
      const key = JSON.stringify(where);
      if (parsed.ok && !sites.has(key)) sites.set(key, { path: where, text, ref: parsed.ref });
    }
  }
  return [...sites.values()];
}

type LooseDef = { readonly type: string } & Record<string, unknown>;
type Leaf = readonly [schema: z.ZodType, value: unknown, path: Path];

/**
 * Each place the walk stops, with the schema there: a reference field, or a field with no fields
 * of its own. A value whose shape the schema does not match yields nothing.
 */
function* leaves(schema: z.ZodType, value: unknown, path: Path, depth: number): Generator<Leaf> {
  if (depth > MAX_DEPTH) return;
  if (refMeta(schema) !== undefined) {
    yield [schema, value, path];
    return;
  }
  const def = schema.def as LooseDef;
  switch (def.type) {
    case "object": {
      if (!isRecord(value)) return;
      const shape = def.shape as Record<string, z.ZodType>;
      for (const [key, child] of Object.entries(shape)) {
        if (key in value) yield* leaves(child, value[key], [...path, key], depth + 1);
      }
      return;
    }
    case "array": {
      if (!Array.isArray(value)) return;
      const element = def.element as z.ZodType;
      for (const [index, item] of value.entries()) {
        yield* leaves(element, item, [...path, index], depth + 1);
      }
      return;
    }
    case "tuple": {
      if (!Array.isArray(value)) return;
      const items = def.items as readonly z.ZodType[];
      for (let index = 0; index < items.length; index++) {
        if (index < value.length) {
          yield* leaves(items[index] as z.ZodType, value[index], [...path, index], depth + 1);
        }
      }
      return;
    }
    case "record": {
      if (!isRecord(value)) return;
      const valueType = def.valueType as z.ZodType;
      for (const [key, child] of Object.entries(value)) {
        yield* leaves(valueType, child, [...path, key], depth + 1);
      }
      return;
    }
    case "optional":
    case "nullable":
    case "default":
    case "prefault":
    case "readonly":
    case "nonoptional":
    case "catch":
      yield* leaves(def.innerType as z.ZodType, value, path, depth + 1);
      return;
    case "pipe":
      yield* leaves(def.in as z.ZodType, value, path, depth + 1);
      return;
    case "lazy":
      yield* leaves((def.getter as () => z.ZodType)(), value, path, depth + 1);
      return;
    case "union": {
      for (const option of def.options as readonly z.ZodType[]) {
        if (option.safeParse(value).success) {
          yield* leaves(option, value, path, depth + 1);
          return;
        }
      }
      return;
    }
    case "intersection":
      yield* leaves(def.left as z.ZodType, value, path, depth + 1);
      yield* leaves(def.right as z.ZodType, value, path, depth + 1);
      return;
    default:
      yield [schema, value, path];
  }
}

/** Every string in a value, however deep in arrays and objects it sits, with its path. */
function* strings(value: unknown, path: Path, depth: number): Generator<readonly [Path, string]> {
  if (depth > MAX_DEPTH) return;
  if (typeof value === "string") {
    yield [path, value];
  } else if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* strings(item, [...path, index], depth + 1);
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value))
      yield* strings(item, [...path, key], depth + 1);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns a copy of `root` with the value at `path` replaced. Containers along the path are copied. */
export function setAtPath(root: unknown, path: Path, replacement: unknown): unknown {
  if (path.length === 0) return replacement;
  const [head, ...rest] = path as [string | number, ...(string | number)[]];
  if (Array.isArray(root)) {
    const copy = [...root];
    copy[head as number] = setAtPath(root[head as number], rest, replacement);
    return copy;
  }
  if (isRecord(root)) {
    return { ...root, [head]: setAtPath(root[head as string], rest, replacement) };
  }
  throw new Error(`Cannot set path ${JSON.stringify(path)} on a non-container value.`);
}

export function getAtPath(root: unknown, path: Path): unknown {
  let current = root;
  for (const segment of path) {
    if (Array.isArray(current)) current = current[segment as number];
    else if (isRecord(current)) current = current[segment as string];
    else return undefined;
  }
  return current;
}

export function formatPath(path: Path): string {
  let out = "input";
  for (const segment of path) {
    out += typeof segment === "number" ? `[${segment}]` : `.${segment}`;
  }
  return out;
}
