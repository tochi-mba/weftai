import type { z } from "zod";
import { DefinitionError } from "./errors.js";
import { isValidOperationName, OPERATION_NAME_RULE } from "./ids.js";
import type { Resolved } from "./schema/ref.js";
import type { CollectionType, OutputData, ResultType, StepOutput } from "./schema/types.js";

export type Effects = "read" | "write";

/**
 * What a host may assume about an operation before it runs, named exactly as MCP's
 * `ToolAnnotations` name them and defaulted the way MCP defaults them: a write is assumed
 * destructive and not idempotent, and anything may reach outside the process, unless the
 * operation says otherwise. Hosts use them to decide what to ask a person about, what is safe
 * to retry, and what to advertise; the model is told which writes are destructive.
 */
export interface OperationAnnotations {
  /** Derived from `effects`; declaring a value that disagrees is a definition error. */
  readonly readOnly?: boolean | undefined;
  /** Destroys or overwrites something a person would miss. Meaningful only for writes. */
  readonly destructive?: boolean | undefined;
  /** Running it twice with the same input has no effect beyond the first. Writes only. */
  readonly idempotent?: boolean | undefined;
  /** Reaches something outside this process: a network service, another person, the world. */
  readonly openWorld?: boolean | undefined;
}

/** The annotations an operation carries once defined: every one decided. */
export interface ResolvedAnnotations {
  readonly readOnly: boolean;
  readonly destructive: boolean;
  readonly idempotent: boolean;
  readonly openWorld: boolean;
}

/**
 * How much of a step's output the model is shown. `auto` shows a preview when a later step in the
 * same plan references this one, and the full read budget otherwise.
 */
export type Presentation = "auto" | "preview" | "full";

export interface StepInfo {
  readonly id: string;
  readonly operation: string;
}

export interface RunContext<I extends z.ZodType, Ctx> {
  /** The validated input with every `$ref` replaced by the collection it resolved to. */
  readonly input: Resolved<z.output<I>>;
  readonly ctx: Ctx;
  readonly signal: AbortSignal;
  readonly step: StepInfo;
  /** Report anything that shortened or shaped the result. Notices are always shown to the model. */
  notice(message: string): void;
  /**
   * Ask the formatter to show named fields next to each item's label, or every catalogued field
   * with `"all"`. Absent values render as `not recorded`.
   */
  showFields(fields: readonly string[] | "all"): void;
}

export type RunResult<O extends ResultType> = OutputData<O> | StepOutput<OutputData<O>>;

export interface OperationExample<I extends z.ZodType> {
  readonly input: z.input<I>;
  readonly note?: string | undefined;
}

export interface OperationSpec<I extends z.ZodType, O extends ResultType, Ctx> {
  /** Namespaced name such as `nodes.find`. */
  readonly name: string;
  /** One or two sentences for the model: what it does and when to use it. */
  readonly description: string;
  /** Model-facing input; must be an object schema. Use `ref()` for fields that take results. */
  readonly input: I;
  readonly output: O;
  /** `write` operations act on the outside world and can be excluded from read-only tools. */
  readonly effects?: Effects | undefined;
  /** For non-collection outputs: the collection type of provenance attached with `withSources`. */
  readonly sources?: CollectionType<unknown, unknown> | undefined;
  /** Validated at definition time, shown in the model-facing description. */
  readonly examples?: readonly OperationExample<I>[] | undefined;
  readonly present?: Presentation | undefined;
  /** What a host may assume before running it. Defaults follow `effects`; see `OperationAnnotations`. */
  readonly annotations?: OperationAnnotations | undefined;
  run(args: RunContext<I, Ctx>): Promise<RunResult<O>> | RunResult<O>;
}

export interface Operation<
  I extends z.ZodType = z.ZodType,
  O extends ResultType = ResultType,
  Ctx = unknown,
> {
  readonly kind: "operation";
  readonly name: string;
  readonly description: string;
  readonly input: I;
  readonly output: O;
  readonly effects: Effects;
  readonly sources: CollectionType<unknown, unknown> | undefined;
  readonly examples: readonly OperationExample<I>[];
  readonly present: Presentation;
  readonly annotations: ResolvedAnnotations;
  run(args: RunContext<I, Ctx>): Promise<RunResult<O>> | RunResult<O>;
}

export type AnyOperation<Ctx = unknown> = Operation<z.ZodType, ResultType, Ctx>;

export function defineOperation<I extends z.ZodType, O extends ResultType, Ctx = unknown>(
  spec: OperationSpec<I, O, Ctx>,
): Operation<I, O, Ctx> {
  if (!isValidOperationName(spec.name)) {
    throw new DefinitionError(`Operation name '${spec.name}' is invalid. ${OPERATION_NAME_RULE}`);
  }
  if (spec.description.trim().length === 0) {
    throw new DefinitionError(
      `Operation '${spec.name}' needs a description; the model relies on it.`,
    );
  }
  if (spec.input.def.type !== "object") {
    throw new DefinitionError(
      `Operation '${spec.name}' input must be an object schema (z.object), not '${spec.input.def.type}'.`,
    );
  }
  if (spec.output.kind === "collection" && spec.sources !== undefined) {
    throw new DefinitionError(
      `Operation '${spec.name}' returns a collection, so 'sources' is redundant; remove it.`,
    );
  }
  const effects = spec.effects ?? "read";
  const annotations = resolveAnnotations(spec.name, effects, spec.annotations);
  const examples = spec.examples ?? [];
  examples.forEach((example, index) => {
    const parsed = spec.input.safeParse(example.input);
    if (!parsed.success) {
      throw new DefinitionError(
        `Operation '${spec.name}' example ${index + 1} does not match its input schema: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      );
    }
  });
  return {
    kind: "operation",
    name: spec.name,
    description: spec.description.trim(),
    input: spec.input,
    output: spec.output,
    effects,
    sources: spec.sources,
    examples,
    present: spec.present ?? "auto",
    annotations,
    run: spec.run,
  };
}

function resolveAnnotations(
  name: string,
  effects: Effects,
  declared: OperationAnnotations | undefined,
): ResolvedAnnotations {
  const readOnly = effects === "read";
  if (declared?.readOnly !== undefined && declared.readOnly !== readOnly) {
    throw new DefinitionError(
      `Operation '${name}' has effects '${effects}' but declares readOnly: ${declared.readOnly}; remove readOnly, it follows from effects.`,
    );
  }
  if (readOnly && declared?.destructive === true) {
    throw new DefinitionError(
      `Operation '${name}' is a read but declares destructive: true; a destructive operation has effects 'write'.`,
    );
  }
  return Object.freeze({
    readOnly,
    destructive: readOnly ? false : (declared?.destructive ?? true),
    idempotent: readOnly ? true : (declared?.idempotent ?? false),
    openWorld: declared?.openWorld ?? true,
  });
}

/** Binds the context type once so each operation in a domain does not repeat it. */
export function defineOperationFor<Ctx>(): <I extends z.ZodType, O extends ResultType>(
  spec: OperationSpec<I, O, Ctx>,
) => Operation<I, O, Ctx> {
  return (spec) => defineOperation(spec);
}

/** The collection type a `$ref` to this operation's result resolves to, if any. */
export function provenanceType(
  operation: AnyOperation<never>,
): CollectionType<unknown, unknown> | undefined {
  return operation.output.kind === "collection" ? operation.output : operation.sources;
}
