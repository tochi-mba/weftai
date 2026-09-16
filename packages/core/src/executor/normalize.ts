import { StepExecutionError } from "../errors.js";
import type { AnyOperation } from "../operation.js";
import type { ResultKind } from "../results/types.js";
import { isStepOutput } from "../schema/types.js";

export interface NormalizedOutput {
  readonly kind: ResultKind;
  readonly type: string | undefined;
  readonly data: unknown;
  readonly items: readonly unknown[] | undefined;
  readonly count: number | undefined;
}

export function normalizeOutput(
  operation: AnyOperation<never>,
  raw: unknown,
  stepId: string,
): NormalizedOutput {
  const wrapped = isStepOutput(raw);
  const data = wrapped ? raw.data : raw;
  const sources = wrapped ? raw.sources : undefined;
  const output = operation.output;

  if (output.kind === "collection") {
    if (!Array.isArray(data)) {
      throw new StepExecutionError(
        stepId,
        operation.name,
        `The handler for '${operation.name}' must return an array of ${output.name}, not ${describeValue(data)}.`,
      );
    }
    const items = Object.freeze([...data]);
    return { kind: "collection", type: output.name, data: items, items, count: items.length };
  }

  const items = sources?.items;
  const type = sources?.type ?? operation.sources?.name;
  const count = sources?.count;

  if (output.kind === "groups") {
    if (!Array.isArray(data)) {
      throw new StepExecutionError(
        stepId,
        operation.name,
        `The handler for '${operation.name}' must return an array of groups, not ${describeValue(data)}.`,
      );
    }
    return { kind: "groups", type, data: Object.freeze([...data]), items, count };
  }

  return { kind: "value", type, data, items, count };
}

/** Only called for values that failed the array check, so arrays never reach here. */
function describeValue(value: unknown): string {
  return value === null ? "null" : typeof value;
}
