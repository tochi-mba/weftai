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

const MAX_DEPTH = 32;

/** Walks a parsed value alongside its schema and collects every reference site, in order. */
export function collectRefs(schema: z.ZodType, value: unknown): RefSite[] {
  const sites: RefSite[] = [];
  visit(schema, value, [], sites, 0);
  return sites;
}

type LooseDef = { readonly type: string } & Record<string, unknown>;

function visit(
  schema: z.ZodType,
  value: unknown,
  path: Path,
  sites: RefSite[],
  depth: number,
): void {
  if (depth > MAX_DEPTH) return;
  const meta = refMeta(schema);
  if (meta !== undefined) {
    if (typeof value === "string") {
      const parsed = parseRef(value);
      sites.push(
        parsed.ok
          ? { path, text: value, parsed: parsed.ref, error: undefined, meta }
          : { path, text: value, parsed: undefined, error: parsed.message, meta },
      );
    }
    return;
  }
  const def = schema.def as LooseDef;
  switch (def.type) {
    case "object": {
      if (!isRecord(value)) return;
      const shape = def.shape as Record<string, z.ZodType>;
      for (const [key, child] of Object.entries(shape)) {
        if (key in value) visit(child, value[key], [...path, key], sites, depth + 1);
      }
      return;
    }
    case "array": {
      if (!Array.isArray(value)) return;
      const element = def.element as z.ZodType;
      for (const [index, item] of value.entries()) {
        visit(element, item, [...path, index], sites, depth + 1);
      }
      return;
    }
    case "tuple": {
      if (!Array.isArray(value)) return;
      const items = def.items as readonly z.ZodType[];
      for (let index = 0; index < items.length; index++) {
        if (index < value.length) {
          visit(items[index] as z.ZodType, value[index], [...path, index], sites, depth + 1);
        }
      }
      return;
    }
    case "record": {
      if (!isRecord(value)) return;
      const valueType = def.valueType as z.ZodType;
      for (const [key, child] of Object.entries(value)) {
        visit(valueType, child, [...path, key], sites, depth + 1);
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
      visit(def.innerType as z.ZodType, value, path, sites, depth + 1);
      return;
    case "pipe":
      visit(def.in as z.ZodType, value, path, sites, depth + 1);
      return;
    case "lazy":
      visit((def.getter as () => z.ZodType)(), value, path, sites, depth + 1);
      return;
    case "union": {
      for (const option of def.options as readonly z.ZodType[]) {
        if (option.safeParse(value).success) {
          visit(option, value, path, sites, depth + 1);
          return;
        }
      }
      return;
    }
    case "intersection":
      visit(def.left as z.ZodType, value, path, sites, depth + 1);
      visit(def.right as z.ZodType, value, path, sites, depth + 1);
      return;
    default:
      return;
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
