import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { closest, levenshtein } from "./levenshtein.js";

const short = fc.string({ maxLength: 24 });

describe("levenshtein properties", () => {
  it("is zero exactly when the strings are equal", () => {
    fc.assert(
      fc.property(short, short, (a, b) => {
        expect(levenshtein(a, b) === 0).toBe(a === b);
      }),
    );
  });

  it("is symmetric", () => {
    fc.assert(
      fc.property(short, short, (a, b) => {
        expect(levenshtein(a, b)).toBe(levenshtein(b, a));
      }),
    );
  });

  it("is bounded below by the length difference and above by the longer length", () => {
    fc.assert(
      fc.property(short, short, (a, b) => {
        const d = levenshtein(a, b);
        expect(d).toBeGreaterThanOrEqual(Math.abs(a.length - b.length));
        expect(d).toBeLessThanOrEqual(Math.max(a.length, b.length));
      }),
    );
  });

  it("satisfies the triangle inequality", () => {
    fc.assert(
      fc.property(short, short, short, (a, b, c) => {
        expect(levenshtein(a, c)).toBeLessThanOrEqual(levenshtein(a, b) + levenshtein(b, c));
      }),
    );
  });

  it("one edit moves the distance by at most one", () => {
    fc.assert(
      fc.property(short, short, fc.string({ minLength: 1, maxLength: 1 }), (a, b, ch) => {
        expect(Math.abs(levenshtein(a + ch, b) - levenshtein(a, b))).toBeLessThanOrEqual(1);
      }),
    );
  });
});

describe("closest properties", () => {
  it("always finds an exact candidate", () => {
    fc.assert(
      fc.property(short, fc.array(short, { maxLength: 8 }), (needle, others) => {
        const found = closest(needle, [...others, needle]);
        expect(found).toBeDefined();
        expect(levenshtein(needle.toLowerCase(), (found as string).toLowerCase())).toBe(0);
      }),
    );
  });

  it("never returns something outside the candidate set", () => {
    fc.assert(
      fc.property(short, fc.array(short, { maxLength: 8 }), (needle, candidates) => {
        const found = closest(needle, candidates);
        if (found !== undefined) expect(candidates).toContain(found);
      }),
    );
  });

  it("respects the distance budget", () => {
    fc.assert(
      fc.property(
        short,
        fc.array(short, { maxLength: 8 }),
        fc.nat({ max: 5 }),
        (needle, candidates, max) => {
          const found = closest(needle, candidates, max);
          if (found !== undefined) {
            expect(levenshtein(needle.toLowerCase(), found.toLowerCase())).toBeLessThanOrEqual(max);
          }
        },
      ),
    );
  });
});
