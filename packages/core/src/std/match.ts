export const FILTER_OPS = [
  "eq",
  "ne",
  "contains",
  "startsWith",
  "gt",
  "gte",
  "lt",
  "lte",
  "fuzzy",
] as const;

export type FilterOp = (typeof FILTER_OPS)[number];

export interface Filter {
  readonly field: string;
  readonly op: FilterOp;
  readonly value: string | number | boolean;
}

export function matchesFilter(actual: unknown, filter: Filter): boolean {
  if (actual === undefined || actual === null) return false;
  switch (filter.op) {
    case "eq":
      return compareEqual(actual, filter.value);
    case "ne":
      return !compareEqual(actual, filter.value);
    case "contains":
      return stringify(actual).includes(stringify(filter.value));
    case "startsWith":
      return stringify(actual).startsWith(stringify(filter.value));
    case "gt":
      return compareOrder(actual, filter.value) > 0;
    case "gte":
      return compareOrder(actual, filter.value) >= 0;
    case "lt":
      return compareOrder(actual, filter.value) < 0;
    case "lte":
      return compareOrder(actual, filter.value) <= 0;
    case "fuzzy":
      return fuzzy(stringify(actual), stringify(filter.value));
  }
}

function stringify(value: unknown): string {
  return String(value).toLowerCase();
}

function compareEqual(actual: unknown, expected: string | number | boolean): boolean {
  if (typeof expected === "boolean" || typeof actual === "boolean") {
    return Boolean(actual) === Boolean(expected);
  }
  if (typeof expected === "number" || typeof actual === "number") {
    return Number(actual) === Number(expected);
  }
  return stringify(actual) === stringify(expected);
}

function compareOrder(actual: unknown, expected: string | number | boolean): number {
  if (typeof expected === "number" || typeof actual === "number") {
    const left = Number(actual);
    const right = Number(expected);
    if (Number.isNaN(left) || Number.isNaN(right)) return Number.NaN;
    return left === right ? 0 : left > right ? 1 : -1;
  }
  const left = stringify(actual);
  const right = stringify(expected);
  return left === right ? 0 : left > right ? 1 : -1;
}

/**
 * Fuzzy means tolerant of casing, punctuation, extra whitespace and placeholder brackets, in
 * either direction: "corporate 1" matches "[Corporate 1]" and "Corporate-1". It is never an
 * edit-distance match, so "Sub 1 Ltd" does not match "Sub 3 Ltd".
 */
function fuzzy(actual: string, expected: string): boolean {
  const a = fold(actual);
  const e = fold(expected);
  if (e.length === 0) return true;
  if (a.length === 0) return false;
  return a.includes(e) || e.includes(a);
}

function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
