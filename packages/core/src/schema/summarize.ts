import type { z } from "zod";
import { refMeta } from "./ref.js";

const MAX_DEPTH = 5;

/** A compact, TypeScript-like rendering of a schema for the model-facing operation list. */
export function summarizeSchema(schema: z.ZodType, depth = 0): string {
  const meta = refMeta(schema);
  if (meta !== undefined) {
    return meta.target === undefined ? "$ref" : `$ref<${meta.target.name}>`;
  }
  if (depth > MAX_DEPTH) return "…";
  const def = schema.def as { readonly type: string } & Record<string, unknown>;
  switch (def.type) {
    case "string":
      return "string";
    case "number":
      return isIntegerFormat(def.format) || hasIntCheck(schema) ? "integer" : "number";
    case "boolean":
      return "boolean";
    case "bigint":
      return "bigint";
    case "date":
      return "date";
    case "null":
      return "null";
    case "undefined":
    case "void":
      return "undefined";
    case "literal":
      return (def.values as readonly unknown[]).map((v) => JSON.stringify(v)).join(" | ");
    case "enum":
      return Object.values(def.entries as Record<string, unknown>)
        .map((v) => JSON.stringify(v))
        .join(" | ");
    case "array":
      return `${wrap(summarizeSchema(def.element as z.ZodType, depth + 1))}[]`;
    case "tuple":
      return `[${(def.items as readonly z.ZodType[]).map((s) => summarizeSchema(s, depth + 1)).join(", ")}]`;
    case "object": {
      const shape = def.shape as Record<string, z.ZodType>;
      const entries = Object.entries(shape).map(([key, child]) => {
        const optional = isOptionalLike(child);
        return `${key}${optional ? "?" : ""}: ${summarizeSchema(child, depth + 1)}`;
      });
      return entries.length === 0 ? "{}" : `{ ${entries.join("; ")} }`;
    }
    case "record":
      return `Record<string, ${summarizeSchema(def.valueType as z.ZodType, depth + 1)}>`;
    case "optional":
    case "default":
    case "prefault":
    case "readonly":
    case "nonoptional":
    case "catch":
      return summarizeSchema(def.innerType as z.ZodType, depth);
    case "nullable":
      return `${summarizeSchema(def.innerType as z.ZodType, depth)} | null`;
    case "union":
      return (def.options as readonly z.ZodType[])
        .map((option) => summarizeSchema(option, depth + 1))
        .join(" | ");
    case "intersection":
      return `${summarizeSchema(def.left as z.ZodType, depth + 1)} & ${summarizeSchema(def.right as z.ZodType, depth + 1)}`;
    case "pipe":
      return summarizeSchema(def.in as z.ZodType, depth);
    case "lazy":
      return summarizeSchema((def.getter as () => z.ZodType)(), depth + 1);
    default:
      return "unknown";
  }
}

function isIntegerFormat(format: unknown): boolean {
  return (
    typeof format === "string" &&
    (format.startsWith("int") || format === "safeint" || format.startsWith("uint"))
  );
}

function hasIntCheck(schema: z.ZodType): boolean {
  const checks = (schema.def as { checks?: readonly unknown[] }).checks ?? [];
  return checks.some((check) => {
    const inner = (check as { _zod?: { def?: { format?: unknown; check?: unknown } } })._zod?.def;
    return (
      inner !== undefined && (isIntegerFormat(inner.format) || inner.check === "number_format")
    );
  });
}

function isOptionalLike(schema: z.ZodType): boolean {
  const type = schema.def.type;
  return type === "optional" || type === "default" || type === "prefault";
}

/** Parenthesise a top-level union or intersection before appending `[]`. */
function wrap(text: string): string {
  return hasTopLevelOperator(text) ? `(${text})` : text;
}

function hasTopLevelOperator(text: string): boolean {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{" || ch === "[" || ch === "(" || ch === "<") depth += 1;
    else if (ch === "}" || ch === "]" || ch === ")" || ch === ">") depth -= 1;
    else if (depth === 0 && (text.startsWith(" | ", i) || text.startsWith(" & ", i))) return true;
  }
  return false;
}
