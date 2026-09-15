/**
 * Reference syntax. A reference names an earlier step's full result (`$owned`) or specific
 * 1-based positions within it (`$owned[2]`, `$owned[1,4,7]`). Positions always index the full
 * result set, never the preview the model was shown.
 */

export interface ParsedRef {
  /** The referenced step id, without the leading `$`. */
  readonly id: string;
  /** 1-based positions, in the order written, duplicates removed. `undefined` means the full set. */
  readonly ordinals: readonly number[] | undefined;
}

/** The canonical grammar, without the whitespace tolerance the parser allows. */
const REF_STRICT_RE = /^\$[A-Za-z_][A-Za-z0-9_]{0,63}(\[[0-9]+(,[0-9]+)*\])?$/;

/** Pattern used in JSON Schema so the model sees the exact grammar. */
export const REF_PATTERN_SOURCE = REF_STRICT_RE.source;

/** The grammar with whitespace tolerance, used wherever a reference is actually validated. */
export const REF_TOLERANT_PATTERN =
  /^\s*\$[A-Za-z_][A-Za-z0-9_]{0,63}(\[\s*[0-9]+(\s*,\s*[0-9]+)*\s*\])?\s*$/;

const REF_RE = /^\$([A-Za-z_][A-Za-z0-9_]{0,63})(?:\[\s*([0-9]+(?:\s*,\s*[0-9]+)*)\s*\])?$/;

export const REF_SYNTAX_RULE =
  "References look like '$stepId' for a whole result, '$stepId[2]' for one position or '$stepId[1,4,7]' for several; positions are 1-based and index the full result set.";

export type ParseRefResult =
  | { readonly ok: true; readonly ref: ParsedRef }
  | { readonly ok: false; readonly message: string };

export function looksLikeRef(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("$");
}

export function parseRef(text: string): ParseRefResult {
  const match = REF_RE.exec(text.trim());
  if (match === null) {
    return { ok: false, message: `'${text}' is not a valid reference. ${REF_SYNTAX_RULE}` };
  }
  const id = match[1] as string;
  const ordinalText = match[2];
  if (ordinalText === undefined) {
    return { ok: true, ref: { id, ordinals: undefined } };
  }
  const seen = new Set<number>();
  const ordinals: number[] = [];
  for (const part of ordinalText.split(",")) {
    const n = Number.parseInt(part.trim(), 10);
    if (n < 1) {
      return {
        ok: false,
        message: `'${text}' uses position ${n}, but positions are 1-based; use '$${id}[1]' for the first item.`,
      };
    }
    if (!seen.has(n)) {
      seen.add(n);
      ordinals.push(n);
    }
  }
  return { ok: true, ref: { id, ordinals } };
}

export function formatRef(ref: ParsedRef): string {
  return ref.ordinals === undefined || ref.ordinals.length === 0
    ? `$${ref.id}`
    : `$${ref.id}[${ref.ordinals.join(",")}]`;
}
