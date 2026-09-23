export { z } from "zod";

export {
  type Answer,
  type AnswerKind,
  Answers,
  type AnyQuestion,
  Batch,
  Calibration,
  type ChoiceQuestion,
  choice,
  type Decider,
  Decomposition,
  Gate,
  MAX_LEVELS,
  MAX_OPTIONS,
  MAX_PROMPT,
  MIN_LEVELS,
  type NoulQuestion,
  NullDecider,
  noul,
  QUESTION_ID,
  type ScoreQuestion,
  score,
} from "./decisions/index.js";
export {
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
  WeftaiError,
} from "./errors.js";
export {
  createRuntime,
  DEFAULT_LIMITS,
  type ExecuteOptions,
  type ExecutionResult,
  type FailurePolicy,
  type Runtime,
  type RuntimeHooks,
  type RuntimeLimits,
  type RuntimeOptions,
  type StepHookInfo,
  type StepResult,
  type StepStatus,
  TRACE_VERSION,
} from "./executor/runtime.js";
export {
  createFormatter,
  type FormatArgs,
  type Formatter,
  type FormatterOptions,
} from "./format/formatter.js";
export { formatProperty, sanitizeLabel } from "./format/sanitize.js";
export { DEFAULT_BUDGETS, estimateTokens, type FormatBudgets } from "./format/tokens.js";
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
export {
  type Plan,
  type PlanInput,
  PlanSchema,
  type PlanStep,
  PlanStepSchema,
} from "./plan/types.js";
export {
  type SessionView,
  type StepRef,
  type ValidatedPlan,
  type ValidatedStep,
  type ValidateOptions,
  type ValidationResult,
  validatePlan,
} from "./plan/validate.js";
export { formatRef, type ParsedRef, parseRef, REF_PATTERN_SOURCE } from "./refs/syntax.js";
export { type DescribeOptions, describeOperations } from "./registry/describe.js";
export { buildPlanSchema, type PlanSchemaOptions } from "./registry/planSchema.js";
export { createRegistry, type Registry, type RegistryOptions } from "./registry.js";
export { resolveRef } from "./results/resolve.js";
export { sessionView } from "./results/session.js";
export { createMemoryStore, type MemoryStoreOptions } from "./results/store.js";
export {
  DEFAULT_SESSION_ID,
  DEFAULT_STORE_LIMITS,
  type ResultKind,
  type ResultStore,
  type SetResult,
  type StoredResult,
} from "./results/types.js";
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
export { type FieldResolution, fieldNames, resolveField } from "./std/fields.js";
export { FILTER_OPS, type Filter, type FilterOp, matchesFilter } from "./std/match.js";
export {
  STANDARD_OP_KINDS,
  type StandardOperationsOptions,
  type StandardOpKind,
  standardOperations,
} from "./std/operations.js";
export { buildTrace, type Trace, type TraceInputRef, type TraceStep } from "./trace.js";

/** Package version, kept in sync with package.json by the release step. */
export const VERSION = "0.3.0";
