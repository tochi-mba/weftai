import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatRef, parseRef, REF_PATTERN_SOURCE, REF_TOLERANT_PATTERN } from "./syntax.js";

const validId = fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/);
const ordinal = fc.integer({ min: 1, max: 1_000_000 });
const ordinals = fc.array(ordinal, { minLength: 1, maxLength: 12 });

function dedupe(values: readonly number[]): number[] {
  return [...new Set(values)];
}

describe("reference syntax properties", () => {
  it("formats every valid reference into something the strict pattern accepts and parses back", () => {
    const strict = new RegExp(REF_PATTERN_SOURCE);
    fc.assert(
      fc.property(validId, fc.option(ordinals, { nil: undefined }), (id, positions) => {
        const text = formatRef({ id, ordinals: positions });
        expect(strict.test(text)).toBe(true);
        const parsed = parseRef(text);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
          expect(parsed.ref.id).toBe(id);
          expect(parsed.ref.ordinals).toEqual(
            positions === undefined ? undefined : dedupe(positions),
          );
        }
      }),
    );
  });

  it("formatting is idempotent after one parse", () => {
    fc.assert(
      fc.property(validId, ordinals, (id, positions) => {
        const canonical = formatRef({ id, ordinals: dedupe(positions) });
        const parsed = parseRef(formatRef({ id, ordinals: positions }));
        expect(parsed.ok).toBe(true);
        if (parsed.ok) expect(formatRef(parsed.ref)).toBe(canonical);
      }),
    );
  });

  it("never throws on arbitrary input and only accepts what the tolerant pattern accepts", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const result = parseRef(text);
        if (result.ok) {
          expect(REF_TOLERANT_PATTERN.test(text)).toBe(true);
          expect(result.ref.ordinals?.every((n) => n >= 1) ?? true).toBe(true);
        } else {
          expect(result.message.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it("whitespace inside the brackets never changes the parsed result", () => {
    fc.assert(
      fc.property(
        validId,
        ordinals,
        fc.array(fc.constantFrom(" ", "\t"), { maxLength: 3 }),
        (id, positions, pad) => {
          const gap = pad.join("");
          const spaced = `${gap}$${id}[${positions.map((n) => `${gap}${n}${gap}`).join(",")}]${gap}`;
          const parsed = parseRef(spaced);
          expect(parsed.ok).toBe(true);
          if (parsed.ok) expect(parsed.ref).toEqual({ id, ordinals: dedupe(positions) });
        },
      ),
    );
  });

  it("any zero anywhere in the positions is rejected with the 1-based hint", () => {
    fc.assert(
      fc.property(validId, ordinals, fc.nat({ max: 12 }), (id, positions, at) => {
        const withZero = [...positions];
        withZero.splice(Math.min(at, withZero.length), 0, 0);
        const result = parseRef(`$${id}[${withZero.join(",")}]`);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.message).toContain("positions are 1-based");
      }),
    );
  });
});
