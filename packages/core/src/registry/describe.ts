import type { AnyOperation } from "../operation.js";
import { summarizeSchema } from "../schema/summarize.js";

export interface DescribeOptions {
  /** Include worked examples under each operation (default true). */
  readonly examples?: boolean | undefined;
  /** Include the introductory paragraph on steps and references (default true). */
  readonly intro?: boolean | undefined;
}

export const REFERENCE_GUIDE =
  'A later step uses an earlier step\'s result by writing "$stepId" in a reference field, or "$stepId[1,3]" for specific 1-based positions in that result. Positions index the full result, not only the lines shown.';

/** Markdown for a tool description or system prompt listing every operation the model can use. */
export function describeOperations(
  operations: readonly AnyOperation<never>[],
  options: DescribeOptions = {},
): string {
  const lines: string[] = [];
  if (options.intro !== false) {
    lines.push(
      'Run one or more steps in a single call. Each step has an "id" (a short name for its result), an "op" (one of the operations below) and an "input". Steps run in dependency order; independent steps run together.',
      "",
      REFERENCE_GUIDE,
      "",
      "Operations:",
    );
  }
  for (const operation of operations) {
    lines.push(`- ${operation.name} — ${operation.description}`);
    lines.push(`  input: ${summarizeSchema(operation.input)}`);
    lines.push(`  returns: ${describeOutput(operation)}`);
    if (options.examples !== false) {
      for (const example of operation.examples) {
        const note = example.note === undefined ? "" : ` (${example.note})`;
        lines.push(`  e.g.${note} ${JSON.stringify(example.input)}`);
      }
    }
  }
  return lines.join("\n");
}

function describeOutput(operation: AnyOperation<never>): string {
  const { output } = operation;
  switch (output.kind) {
    case "collection":
      return output.name;
    case "groups":
      return operation.sources === undefined
        ? "grouped counts"
        : `grouped counts (references resolve to the ${operation.sources.name} counted)`;
    case "value": {
      const summary = summarizeSchema(output.schema);
      return operation.sources === undefined
        ? summary
        : `${summary} (references resolve to the ${operation.sources.name} it was computed from)`;
    }
  }
}
