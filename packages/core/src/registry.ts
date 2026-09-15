import { RegistryError } from "./errors.js";
import { type AnyOperation, provenanceType } from "./operation.js";
import { type DescribeOptions, describeOperations } from "./registry/describe.js";
import { buildPlanSchema, type PlanSchemaOptions } from "./registry/planSchema.js";
import type { JsonSchema } from "./schema/json.js";
import type { CollectionType } from "./schema/types.js";
import { closest } from "./util/levenshtein.js";

export interface Registry<Ctx = unknown> {
  readonly operations: readonly AnyOperation<Ctx>[];
  get(name: string): AnyOperation<Ctx> | undefined;
  /** Like `get`, but throws a `RegistryError` naming the nearest operation when missing. */
  require(name: string): AnyOperation<Ctx>;
  has(name: string): boolean;
  names(): readonly string[];
  /** The nearest known operation name, for "did you mean" hints. */
  suggest(name: string): string | undefined;
  /** Every distinct collection type an operation can produce or attach as provenance. */
  collections(): readonly CollectionType<unknown, unknown>[];
  /** A registry restricted to the operations that pass `predicate`; used per exposed tool. */
  filter(predicate: (operation: AnyOperation<Ctx>) => boolean): Registry<Ctx>;
  describe(options?: DescribeOptions): string;
  planSchema(options?: PlanSchemaOptions): JsonSchema;
}

export interface RegistryOptions<Ctx> {
  readonly operations: readonly AnyOperation<Ctx>[];
}

export function createRegistry<Ctx = unknown>(options: RegistryOptions<Ctx>): Registry<Ctx> {
  const byName = new Map<string, AnyOperation<Ctx>>();
  for (const operation of options.operations) {
    if (byName.has(operation.name)) {
      throw new RegistryError(
        "registry.duplicate",
        `Operation '${operation.name}' is registered twice; operation names must be unique.`,
      );
    }
    byName.set(operation.name, operation);
  }
  const operations = Object.freeze([...byName.values()]);
  const names = Object.freeze(operations.map((operation) => operation.name));

  const registry: Registry<Ctx> = {
    operations,
    get: (name) => byName.get(name),
    require(name) {
      const found = byName.get(name);
      if (found !== undefined) return found;
      const suggestion = registry.suggest(name);
      const hint = suggestion === undefined ? "" : ` Did you mean '${suggestion}'?`;
      throw new RegistryError("registry.unknown", `Unknown operation '${name}'.${hint}`);
    },
    has: (name) => byName.has(name),
    names: () => names,
    suggest: (name) => closest(name, names),
    collections() {
      const seen = new Map<string, CollectionType<unknown, unknown>>();
      for (const operation of operations) {
        const type = provenanceType(operation as AnyOperation<never>);
        if (type !== undefined && !seen.has(type.name)) seen.set(type.name, type);
      }
      return [...seen.values()];
    },
    filter: (predicate) => createRegistry({ operations: operations.filter(predicate) }),
    describe: (describeOptions) =>
      describeOperations(operations as readonly AnyOperation<never>[], describeOptions),
    planSchema: (schemaOptions) =>
      buildPlanSchema(operations as readonly AnyOperation<never>[], schemaOptions),
  };
  return registry;
}
