import type { AnyOperation } from "../operation.js";
import { buildPlanSchema } from "../registry/planSchema.js";
import type { JsonSchema } from "../schema/json.js";
import type { SchemaDialect } from "./types.js";

const GEMINI_KEEP = new Set([
  "type",
  "description",
  "properties",
  "required",
  "items",
  "enum",
  "nullable",
  "format",
  "anyOf",
  "$ref",
  "$defs",
]);

const NOVA_OBJECT_KEEP = new Set(["type", "properties", "required"]);

export function compilePlanSchema(
  operations: readonly AnyOperation<never>[],
  dialect: SchemaDialect,
  options: { readonly strict?: boolean | undefined; readonly maxSteps?: number | undefined } = {},
): JsonSchema {
  const closed = dialect === "anthropic" ? options.strict !== false : options.strict === true;
  if (dialect === "loose" || dialect === "bedrock-nova") {
    const schema = buildPlanSchema(operations, {
      style: "loose",
      strict: true,
      maxSteps: options.maxSteps,
    });
    return dialect === "bedrock-nova" ? novaRestrict(schema) : schema;
  }
  if (dialect === "openai-strict") {
    // Union steps always wrap variants in anyOf, which strict mode rejects.
    return buildPlanSchema(operations, {
      style: "loose",
      strict: true,
      maxSteps: options.maxSteps,
    });
  }
  const union = buildPlanSchema(operations, {
    style: "union",
    strict: closed,
    maxSteps: options.maxSteps,
  });
  if (dialect === "gemini-openapi") return stripGemini(union, false);
  if (dialect === "gemini-vertex") return stripGemini(union, true);
  return union;
}

export function containsAnyOf(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsAnyOf);
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if ("anyOf" in record) return true;
  return Object.values(record).some(containsAnyOf);
}

function stripGemini(value: unknown, uppercase: boolean): JsonSchema {
  if (Array.isArray(value)) {
    return value.map((item) => stripGemini(item, uppercase)) as unknown as JsonSchema;
  }
  if (typeof value !== "object" || value === null) {
    return value as JsonSchema;
  }
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (!GEMINI_KEEP.has(key) && key !== "minItems" && key !== "maxItems" && key !== "const") {
      continue;
    }
    if (key === "type" && uppercase && typeof child === "string") {
      out.type = child.toUpperCase();
      continue;
    }
    out[key] = stripGemini(child, uppercase);
  }
  return out;
}

function novaRestrict(value: unknown, depth = 0): JsonSchema {
  if (Array.isArray(value)) {
    return value.map((item) => novaRestrict(item, depth + 1)) as unknown as JsonSchema;
  }
  if (typeof value !== "object" || value === null) return value as JsonSchema;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const keep = depth === 0 || record.type === "object" ? NOVA_OBJECT_KEEP : undefined;
  for (const [key, child] of Object.entries(record)) {
    if (keep !== undefined && record.type === "object" && !keep.has(key) && key !== "items") {
      continue;
    }
    out[key] = novaRestrict(child, depth + 1);
  }
  return out;
}
