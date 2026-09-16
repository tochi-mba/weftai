import { describe, expect, it } from "vitest";
import { closest, levenshtein } from "./levenshtein.js";

describe("levenshtein", () => {
  it("is zero for identical strings, including empty ones", () => {
    expect(levenshtein("", "")).toBe(0);
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  it("equals the other length when one side is empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("counts a single substitution, insertion or deletion as one", () => {
    expect(levenshtein("cat", "cut")).toBe(1);
    expect(levenshtein("cat", "cats")).toBe(1);
    expect(levenshtein("cats", "cat")).toBe(1);
  });

  it("computes classic distances", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("flaw", "lawn")).toBe(2);
    expect(levenshtein("intention", "execution")).toBe(5);
  });

  it("is symmetric", () => {
    expect(levenshtein("nodes.find", "nodes.filter")).toBe(
      levenshtein("nodes.filter", "nodes.find"),
    );
  });

  it("is case-sensitive", () => {
    expect(levenshtein("Abc", "abc")).toBe(1);
  });

  it("treats a transposition as two edits", () => {
    expect(levenshtein("ab", "ba")).toBe(2);
  });

  it("counts UTF-16 code units, so astral characters count as two", () => {
    expect(levenshtein("a", "😀")).toBe(2);
    expect(levenshtein("é", "e")).toBe(1);
  });
});

describe("closest", () => {
  it("suggests a near miss and ignores case", () => {
    expect(closest("owner", ["owned", "acme", "delaware"])).toBe("owned");
    expect(closest("Jurisdicton", ["Jurisdiction", "label"])).toBe("Jurisdiction");
    expect(closest("OWNED", ["owned"])).toBe("owned");
  });

  it("returns the candidate's original casing", () => {
    expect(closest("jurisdiction", ["Jurisdiction"])).toBe("Jurisdiction");
  });

  it("returns undefined when nothing is close", () => {
    expect(closest("zzzz", ["owned", "acme"])).toBeUndefined();
  });

  it("returns undefined for no candidates", () => {
    expect(closest("owned", [])).toBeUndefined();
  });

  it("prefers the nearest of several candidates", () => {
    expect(closest("nodes.fin", ["nodes.find", "nodes.filter", "edges.find"])).toBe("nodes.find");
  });

  it("breaks ties in favour of the first candidate", () => {
    expect(closest("ab", ["ac", "ad"])).toBe("ac");
    expect(closest("ab", ["ad", "ac"])).toBe("ad");
  });

  it("returns an exact match even with a zero distance budget", () => {
    expect(closest("owned", ["acme", "owned"], 0)).toBe("owned");
    expect(closest("Owned", ["owned"], 0)).toBe("owned");
    expect(closest("ownd", ["owned"], 0)).toBeUndefined();
  });

  it("scales the default budget with input length, never below two", () => {
    expect(closest("ab", ["zz"])).toBe("zz");
    expect(closest("abc", ["xyz"])).toBeUndefined();
    expect(closest("abcdefghijkl", ["abcdefghXXXX"])).toBe("abcdefghXXXX");
    expect(closest("abcdefghijkl", ["abcdefgXXXXX"])).toBeUndefined();
  });

  it("accepts any iterable of candidates", () => {
    expect(closest("owner", new Set(["owned"]))).toBe("owned");
    expect(closest("owner", new Map([["owned", 1]]).keys())).toBe("owned");
  });

  it("handles an empty input", () => {
    expect(closest("", ["a", "bb"])).toBe("a");
    expect(closest("", ["abc"])).toBeUndefined();
  });
});
