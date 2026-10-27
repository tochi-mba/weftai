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

/** What the model is told `rerun` does. Shared word for word with the Python line. */
export const RERUN_DESCRIPTION =
  "Name a step of an earlier plan to run that plan again: steps then holds only the steps to change or add. Steps that succeeded and depend on nothing that changed are reused, not run.";

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
  // No minItems: a rerun may change nothing and run an earlier plan's failed steps again.
  // Validation still refuses an empty plan that names no rerun.
  const steps: JsonSchema = {
    type: "array",
    items,
    description:
      "Steps to run. A step may reference earlier steps' results with $id; independent steps run together.",
  };
  if (options.maxSteps !== undefined) steps.maxItems = options.maxSteps;
  const rerun: JsonSchema = strict
    ? // Strict modes require every property; null says "not a rerun". A type list, not anyOf,
      // which OpenAI's strict mode refuses.
      { type: ["string", "null"], pattern: STEP_ID_PATTERN.source, description: RERUN_DESCRIPTION }
    : { type: "string", pattern: STEP_ID_PATTERN.source, description: RERUN_DESCRIPTION };
  return {
    type: "object",
    properties: { steps, rerun },
    required: strict ? ["steps", "rerun"] : ["steps"],
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
