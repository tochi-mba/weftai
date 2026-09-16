/**
 * Run `fn` over `items` with at most `limit` promises in flight. Results stay in input order.
 * A `limit` of 1 is sequential; `Infinity` is unbounded.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  const n = Math.max(1, Math.min(limit, items.length));
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index] as T, index);
    }
  }

  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}
