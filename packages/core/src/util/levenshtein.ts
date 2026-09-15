/** Edit distance, used for "did you mean" hints on unknown operation names, step ids and fields. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
    }
    [previous, current] = [current, previous];
  }
  return previous[b.length] as number;
}

/**
 * The closest candidate to `input`, or `undefined` when nothing is close enough to be a useful
 * suggestion. Comparison is case-insensitive; the returned string keeps the candidate's casing.
 */
export function closest(
  input: string,
  candidates: Iterable<string>,
  maxDistance = Math.max(2, Math.floor(input.length / 3)),
): string | undefined {
  const needle = input.toLowerCase();
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = levenshtein(needle, candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return bestDistance <= maxDistance ? best : undefined;
}
