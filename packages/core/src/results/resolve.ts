import { RefResolutionError } from "../errors.js";
import { formatRef, type ParsedRef } from "../refs/syntax.js";
import { type Collection, makeCollection } from "../schema/types.js";
import type { StoredResult } from "./types.js";

/**
 * Resolve a `$ref` against a stored result. Positions are 1-based and index the full item set,
 * never a preview the model was shown.
 */
export function resolveRef(stored: StoredResult, ref: ParsedRef, stepId?: string): Collection {
  const text = formatRef(ref);
  if (stored.items === undefined) {
    throw new RefResolutionError(
      text,
      `'${text}' has no entities to reference. Reference a step that returned a collection.`,
      stepId,
    );
  }
  const typeName = stored.type ?? stored.id;
  if (ref.ordinals === undefined) {
    return makeCollection(typeName, stored.items);
  }
  if (stored.items.length === 0) {
    throw new RefResolutionError(
      text,
      `'${stored.id}' is empty, so '${text}' cannot pick a position.`,
      stepId,
    );
  }
  const picked: unknown[] = [];
  for (const n of ref.ordinals) {
    const item = stored.items[n - 1];
    if (item === undefined) {
      throw new RefResolutionError(
        text,
        `'${text}' asks for position ${n}, but '${stored.id}' holds ${stored.items.length} item(s). Use a position between 1 and ${stored.items.length}.`,
        stepId,
      );
    }
    picked.push(item);
  }
  return makeCollection(typeName, picked);
}
