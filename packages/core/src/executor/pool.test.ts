import { describe, expect, it } from "vitest";
import { mapPool } from "./pool.js";

function defer<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("mapPool", () => {
  it("returns an empty array for no items", async () => {
    expect(await mapPool([], 4, async (x) => x)).toEqual([]);
  });

  it("preserves input order even when later items finish first", async () => {
    const gates = [defer<number>(), defer<number>(), defer<number>()];
    const started: number[] = [];
    const resultPromise = mapPool([0, 1, 2], 3, async (n) => {
      started.push(n);
      const gate = gates[n];
      if (gate === undefined) throw new Error(`missing gate ${n}`);
      return gate.promise;
    });
    await expect.poll(() => started.length).toBe(3);
    gates[2]?.resolve(20);
    gates[0]?.resolve(0);
    gates[1]?.resolve(10);
    expect(await resultPromise).toEqual([0, 10, 20]);
  });

  it("runs sequentially when the limit is 1", async () => {
    const seen: number[] = [];
    await mapPool([1, 2, 3], 1, async (n) => {
      seen.push(n);
      return n;
    });
    expect(seen).toEqual([1, 2, 3]);
  });

  it("treats a limit below 1 as one worker", async () => {
    expect(await mapPool(["a"], 0, async (x) => x)).toEqual(["a"]);
  });
});
