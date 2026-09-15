import { STEP_ID_PATTERN } from "../ids.js";
import type { AnyOperation } from "../operation.js";
import { inputJsonSchema, type JsonSchema } from "../schema/json.js";

export interface PlanSchemaOptions {
  /**
   * `union` emits one variant per operation with its exact input schema (best validation);
   * `loose` emits a single step shape with `op` as an enum and a free-form `input` (smallest).
   */
  readonly style?: "union" | "loose" | undefined;
  /** Make every object closed and every property required, for strict tool-use modes. */
  readonly strict?: boolean | undefined;
  readonly maxSteps?: number | undefined;
}

const STEP_ID_SCHEMA: JsonSchema = {
  type: "string",
  pattern: STEP_ID_PATTERN.source,
  description: "Short name for this step's result; later steps reference it as $id.",
};

/** JSON Schema for a whole plan: the single tool input the model produces. */
export function buildPlanSchema(
  operations: readonly AnyOperation<never>[],
  options: PlanSchemaOptions = {},
): JsonSchema {
  const style = options.style ?? "union";
  const strict = options.strict === true;
  const items = style === "union" ? unionStep(operations, strict) : looseStep(operations, strict);
  const steps: JsonSchema = {
    type: "array",
    minItems: 1,
    items,
    description:
      "Steps to run. A step may reference earlier steps' results with $id; independent steps run together.",
  };
  if (options.maxSteps !== undefined) steps.maxItems = options.maxSteps;
  return {
    type: "object",
    properties: { steps },
    required: ["steps"],
    additionalProperties: false,
  };
}

function unionStep(operations: readonly AnyOperation<never>[], strict: boolean): JsonSchema {
  const variants = operations.map((operation) => ({
    type: "object",
    description: operation.description,
    properties: {
      id: STEP_ID_SCHEMA,
      op: { const: operation.name },
      input: inputJsonSchema(operation.input, { strict }),
    },
    required: strict ? ["id", "op", "input"] : ["id", "op"],
    additionalProperties: false,
  }));
  return { anyOf: variants };
}

function looseStep(operations: readonly AnyOperation<never>[], strict: boolean): JsonSchema {
  return {
    type: "object",
    properties: {
      id: STEP_ID_SCHEMA,
      op: {
        type: "string",
        enum: operations.map((operation) => operation.name),
        description: "The operation to run; each operation's input is listed in the description.",
      },
      input: { type: "object", description: "Arguments for the operation." },
    },
    required: strict ? ["id", "op", "input"] : ["id", "op"],
    additionalProperties: false,
  };
}
