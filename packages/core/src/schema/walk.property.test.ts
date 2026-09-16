import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatPath, getAtPath, type Path, setAtPath } from "./walk.js";

function paths(value: unknown, prefix: Path = []): Path[] {
  const found: Path[] = [prefix];
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) found.push(...paths(item, [...prefix, index]));
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) found.push(...paths(child, [...prefix, key]));
  }
  return found;
}

const json = fc.jsonValue({ maxDepth: 4 });

describe("path helper properties", () => {
  it("setAtPath followed by getAtPath returns the replacement at every existing path", () => {
    fc.assert(
      fc.property(json, fc.string(), (root, marker) => {
        for (const path of paths(root)) {
          const next = setAtPath(root, path, { marker });
          expect(getAtPath(next, path)).toEqual({ marker });
        }
      }),
    );
  });

  it("setAtPath never mutates the original", () => {
    fc.assert(
      fc.property(json, (root) => {
        const snapshot = JSON.stringify(root);
        for (const path of paths(root)) setAtPath(root, path, "x");
        expect(JSON.stringify(root)).toBe(snapshot);
      }),
    );
  });

  it("setAtPath leaves every other existing path unchanged", () => {
    fc.assert(
      fc.property(json, (root) => {
        const all = paths(root);
        for (const target of all) {
          const next = setAtPath(root, target, "replaced");
          for (const other of all) {
            const overlaps =
              other.length >= target.length && target.every((seg, i) => other[i] === seg);
            const isAncestor =
              other.length < target.length && other.every((seg, i) => target[i] === seg);
            if (!overlaps && !isAncestor) {
              expect(getAtPath(next, other)).toEqual(getAtPath(root, other));
            }
          }
        }
      }),
    );
  });

  it("puts a leading numeric index in brackets", () => {
    fc.assert(
      fc.property(fc.nat({ max: 20 }), (n) => {
        expect(formatPath([n])).toBe(`input[${n}]`);
      }),
    );
  });

  it("joins a name then an index without a dot before the bracket", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z]+$/), fc.nat({ max: 20 }), (name, n) => {
        expect(formatPath([name, n])).toBe(`input.${name}[${n}]`);
      }),
    );
  });

  it("getAtPath is total", () => {
    fc.assert(
      fc.property(
        json,
        fc.array(fc.oneof(fc.string(), fc.nat({ max: 5 })), { maxLength: 4 }),
        (root, path) => {
          expect(() => getAtPath(root, path)).not.toThrow();
        },
      ),
    );
  });
});
