export { z } from "zod";

export {
  AgentweftError,
  DefinitionError,
  formatIssue,
  formatIssues,
  type IssueCode,
  LimitExceededError,
  type PlanIssue,
  PlanValidationError,
  RefResolutionError,
  RegistryError,
  StepExecutionError,
} from "./errors.js";
export {
  isValidOperationName,
  isValidStepId,
  OPERATION_NAME_PATTERN,
  STEP_ID_PATTERN,
} from "./ids.js";
export {
  type AnyOperation,
  defineOperation,
  defineOperationFor,
  type Effects,
  type Operation,
  type OperationExample,
  type OperationSpec,
  type Presentation,
  provenanceType,
  type RunContext,
  type RunResult,
  type StepInfo,
} from "./operation.js";
export { formatRef, type ParsedRef, parseRef, REF_PATTERN_SOURCE } from "./refs/syntax.js";
export { type DescribeOptions, describeOperations } from "./registry/describe.js";
export { buildPlanSchema, type PlanSchemaOptions } from "./registry/planSchema.js";
export { createRegistry, type Registry, type RegistryOptions } from "./registry.js";
export { inputJsonSchema, type JsonSchema, type JsonSchemaOptions } from "./schema/json.js";
export {
  isRefSchema,
  type Ref,
  type RefMeta,
  type RefTarget,
  type Resolved,
  ref,
  refMeta,
} from "./schema/ref.js";
export { summarizeSchema } from "./schema/summarize.js";
export {
  type Collection,
  type CollectionOptions,
  type CollectionType,
  collection,
  type FieldSpec,
  type Group,
  type GroupsType,
  groups,
  isStepOutput,
  makeCollection,
  type OutputData,
  type ResultType,
  type StepOutput,
  type ValueType,
  value,
  withSources,
} from "./schema/types.js";

/** Package version, kept in sync with package.json by the release step. */
export const VERSION = "0.0.0";
