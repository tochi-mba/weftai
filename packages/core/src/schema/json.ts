import { z } from "zod";
import { REF_PATTERN_SOURCE } from "../refs/syntax.js";
import { refMeta } from "./ref.js";

export type JsonSchema = Record<string, unknown>;

export interface JsonSchemaOptions {
  /** Add `additionalProperties: false` to every object so the schema can be used in strict mode. */
  readonly strict?: boolean | undefined;
}

/**
 * The model-facing JSON Schema for an operation input. References render as strings constrained
 * by the reference grammar; defaults and optionality follow the input side of the Zod schema.
 */
export function inputJsonSchema(schema: z.ZodType, options: JsonSchemaOptions = {}): JsonSchema {
  const generated = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
    override: ({ zodSchema, jsonSchema }) => {
      const meta = refMeta(zodSchema as unknown as z.ZodType);
      if (meta !== undefined) {
        for (const key of Object.keys(jsonSchema)) {
          if (key !== "description") delete (jsonSchema as JsonSchema)[key];
        }
        (jsonSchema as JsonSchema).type = "string";
        (jsonSchema as JsonSchema).pattern = REF_PATTERN_SOURCE;
        return;
      }
      if (options.strict === true && (jsonSchema as JsonSchema).type === "object") {
        const target = jsonSchema as JsonSchema;
        target.additionalProperties = false;
        if (target.properties !== undefined) {
          const props = Object.keys(target.properties as Record<string, unknown>);
          target.required = props;
        }
      }
    },
  }) as JsonSchema;
  delete generated.$schema;
  return generated;
}
