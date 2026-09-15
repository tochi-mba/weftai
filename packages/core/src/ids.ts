/** Step ids are short, human-readable handles: `acme`, `owned`, `delawareSubs`. */
export const STEP_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/** Operation names are namespaced, `domain.verb`: `nodes.find`, `contracts.expiringWithin`. */
export const OPERATION_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;

export function isValidStepId(id: string): boolean {
  return STEP_ID_PATTERN.test(id);
}

export function isValidOperationName(name: string): boolean {
  return OPERATION_NAME_PATTERN.test(name);
}

export const STEP_ID_RULE =
  "Step ids start with a letter or underscore and contain only letters, digits and underscores (at most 64 characters).";

export const OPERATION_NAME_RULE =
  "Operation names are namespaced lowerCamelCase segments joined by dots, such as 'nodes.find'.";
