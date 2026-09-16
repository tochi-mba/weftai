/**
 * Error types. Every message is a sentence that names what to change; these strings are shown to
 * the model verbatim, so they must be actionable without any surrounding context.
 */

export type IssueCode =
  | "plan.invalid_shape"
  | "plan.too_many_steps"
  | "step.invalid_id"
  | "step.duplicate_id"
  | "step.unknown_operation"
  | "step.invalid_input"
  | "step.write_not_allowed"
  | "ref.invalid_syntax"
  | "ref.unknown_target"
  | "ref.forward_reference"
  | "ref.self_reference"
  | "ref.type_mismatch"
  | "ref.ordinal_out_of_range";

export interface PlanIssue {
  readonly code: IssueCode;
  /** The step the issue belongs to, when it can be attributed to one. */
  readonly stepId?: string | undefined;
  /** JSON path inside the step input, when the issue is about a specific field. */
  readonly path?: readonly (string | number)[] | undefined;
  /** What is wrong, as one sentence. */
  readonly message: string;
  /** What to do about it, as one sentence, when there is a concrete suggestion. */
  readonly hint?: string | undefined;
}

export class WeftaiError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }

  toJSON(): { readonly name: string; readonly code: string; readonly message: string } {
    return { name: this.name, code: this.code, message: this.message };
  }
}

/** Thrown by `defineOperation`, `collection` and friends when a definition is malformed. */
export class DefinitionError extends WeftaiError {
  constructor(message: string) {
    super("definition.invalid", message);
  }
}

/** Thrown by `createRegistry` on duplicate or missing operations. */
export class RegistryError extends WeftaiError {
  constructor(code: "registry.duplicate" | "registry.unknown", message: string) {
    super(code, message);
  }
}

/** A plan failed validation. `issues` lists every problem found, not only the first. */
export class PlanValidationError extends WeftaiError {
  readonly issues: readonly PlanIssue[];

  constructor(issues: readonly PlanIssue[]) {
    super("plan.invalid", formatIssues(issues));
    this.issues = issues;
  }

  override toJSON(): {
    readonly name: string;
    readonly code: string;
    readonly message: string;
    readonly issues: readonly PlanIssue[];
  } {
    return { ...super.toJSON(), issues: this.issues };
  }
}

/** A `$ref` could not be resolved at execution time (missing result, ordinal out of range). */
export class RefResolutionError extends WeftaiError {
  readonly ref: string;
  readonly stepId: string | undefined;

  constructor(ref: string, message: string, stepId?: string) {
    super("ref.unresolved", message);
    this.ref = ref;
    this.stepId = stepId;
  }

  override toJSON(): {
    readonly name: string;
    readonly code: string;
    readonly message: string;
    readonly ref: string;
    readonly stepId: string | undefined;
  } {
    return { ...super.toJSON(), ref: this.ref, stepId: this.stepId };
  }
}

/** An operation handler threw, timed out or was aborted. */
export class StepExecutionError extends WeftaiError {
  readonly stepId: string;
  readonly operation: string;

  constructor(stepId: string, operation: string, message: string, options?: ErrorOptions) {
    super("step.failed", message, options);
    this.stepId = stepId;
    this.operation = operation;
  }

  override toJSON(): {
    readonly name: string;
    readonly code: string;
    readonly message: string;
    readonly stepId: string;
    readonly operation: string;
  } {
    return { ...super.toJSON(), stepId: this.stepId, operation: this.operation };
  }
}

/** A hard limit was exceeded. Hard limits fail loudly; soft limits emit notices instead. */
export class LimitExceededError extends WeftaiError {
  readonly limit: string;
  readonly actual: number;
  readonly max: number;

  constructor(limit: string, actual: number, max: number, message: string) {
    super("limit.exceeded", message);
    this.limit = limit;
    this.actual = actual;
    this.max = max;
  }

  override toJSON(): {
    readonly name: string;
    readonly code: string;
    readonly message: string;
    readonly limit: string;
    readonly actual: number;
    readonly max: number;
  } {
    return { ...super.toJSON(), limit: this.limit, actual: this.actual, max: this.max };
  }
}

export function formatIssues(issues: readonly PlanIssue[]): string {
  if (issues.length === 0) return "The plan is invalid.";
  return issues.map(formatIssue).join("\n");
}

export function formatIssue(issue: PlanIssue): string {
  const where = issue.stepId === undefined ? "" : `Step '${issue.stepId}': `;
  const hint = issue.hint === undefined ? "" : ` ${issue.hint}`;
  return `${where}${issue.message}${hint}`;
}
