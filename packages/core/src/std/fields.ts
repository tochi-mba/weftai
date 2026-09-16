import type { CollectionType, FieldSpec } from "../schema/types.js";
import { closest } from "../util/levenshtein.js";

export type FieldResolution<T> =
  | { readonly ok: true; readonly field: FieldSpec<T> }
  | { readonly ok: false; readonly message: string };

/**
 * Exact field names win over aliases. A miss lists every available field and, when close, the
 * nearest name.
 */
export function resolveField<T, Ctx>(
  type: CollectionType<T, Ctx>,
  name: string,
  ctx: Ctx,
): FieldResolution<T> {
  const catalogue = type.fields?.(ctx) ?? [];
  if (catalogue.length === 0) {
    return {
      ok: false,
      message: `${type.name} has no fields. This collection cannot be filtered, grouped or detailed.`,
    };
  }
  const exact = catalogue.find((field) => field.name === name);
  if (exact !== undefined) return { ok: true, field: exact };
  const aliased = catalogue.find((field) => field.aliases?.includes(name) === true);
  if (aliased !== undefined) return { ok: true, field: aliased };

  const names = catalogue.map((field) => field.name);
  const aliases = catalogue.flatMap((field) => [...(field.aliases ?? [])]);
  const suggestion = closest(name, [...names, ...aliases]);
  const available = names.join(", ");
  const hint =
    suggestion === undefined
      ? `Available fields: ${available}.`
      : `Available fields: ${available}. Did you mean '${suggestion}'?`;
  return {
    ok: false,
    message: `Unknown field '${name}' on ${type.name}. ${hint}`,
  };
}

export function fieldNames<T, Ctx>(type: CollectionType<T, Ctx>, ctx: Ctx): readonly string[] {
  return (type.fields?.(ctx) ?? []).map((field) => field.name);
}
