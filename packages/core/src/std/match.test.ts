import { describe, expect, it } from "vitest";
import { FILTER_OPS, type FilterOp, matchesFilter } from "./match.js";

const filter = (op: FilterOp, value: string | number | boolean) => ({ field: "f", op, value });

describe("FILTER_OPS", () => {
  it("lists every operator once", () => {
    expect([...FILTER_OPS]).toEqual([
      "eq",
      "ne",
      "contains",
      "startsWith",
      "gt",
      "gte",
      "lt",
      "lte",
      "fuzzy",
    ]);
    expect(new Set(FILTER_OPS).size).toBe(FILTER_OPS.length);
  });
});

describe("matchesFilter: absent values", () => {
  it("never matches undefined or null, whatever the operator", () => {
    for (const op of FILTER_OPS) {
      expect(matchesFilter(undefined, filter(op, "x")), op).toBe(false);
      expect(matchesFilter(null, filter(op, "x")), op).toBe(false);
    }
  });
});

describe("matchesFilter: eq and ne", () => {
  it("compares strings case-insensitively", () => {
    expect(matchesFilter("Delaware", filter("eq", "delaware"))).toBe(true);
    expect(matchesFilter("Delaware", filter("eq", "Delawar"))).toBe(false);
    expect(matchesFilter("Delaware", filter("ne", "delaware"))).toBe(false);
    expect(matchesFilter("Delaware", filter("ne", "UK"))).toBe(true);
  });

  it("compares numbers numerically, even when one side is a numeric string", () => {
    expect(matchesFilter(10, filter("eq", 10))).toBe(true);
    expect(matchesFilter("10", filter("eq", 10))).toBe(true);
    expect(matchesFilter(10, filter("eq", "10"))).toBe(true);
    expect(matchesFilter(10, filter("eq", 11))).toBe(false);
    expect(matchesFilter("ten", filter("eq", 10))).toBe(false);
  });

  it("compares booleans by truthiness of the other side", () => {
    expect(matchesFilter(true, filter("eq", true))).toBe(true);
    expect(matchesFilter(false, filter("eq", false))).toBe(true);
    expect(matchesFilter("yes", filter("eq", true))).toBe(true);
    expect(matchesFilter(0, filter("eq", false))).toBe(true);
    expect(matchesFilter(true, filter("ne", true))).toBe(false);
  });

  it("matches the percentage label exactly as written", () => {
    expect(matchesFilter("50%", filter("eq", "50%"))).toBe(true);
    expect(matchesFilter("50%", filter("eq", "50"))).toBe(false);
  });
});

describe("matchesFilter: contains and startsWith", () => {
  it("are case-insensitive substring and prefix checks", () => {
    expect(matchesFilter("Acme MSA 2024", filter("contains", "msa"))).toBe(true);
    expect(matchesFilter("Acme MSA 2024", filter("contains", "nda"))).toBe(false);
    expect(matchesFilter("Acme MSA 2024", filter("startsWith", "acme"))).toBe(true);
    expect(matchesFilter("Acme MSA 2024", filter("startsWith", "MSA"))).toBe(false);
  });

  it("stringify non-strings before checking", () => {
    expect(matchesFilter(12345, filter("contains", "234"))).toBe(true);
    expect(matchesFilter(true, filter("startsWith", "tr"))).toBe(true);
  });

  it("treats an empty needle as matching everything", () => {
    expect(matchesFilter("anything", filter("contains", ""))).toBe(true);
    expect(matchesFilter("anything", filter("startsWith", ""))).toBe(true);
  });
});

describe("matchesFilter: ordering", () => {
  it("orders numbers numerically", () => {
    expect(matchesFilter(10, filter("gt", 9))).toBe(true);
    expect(matchesFilter(10, filter("gt", 10))).toBe(false);
    expect(matchesFilter(10, filter("gte", 10))).toBe(true);
    expect(matchesFilter(10, filter("lt", 11))).toBe(true);
    expect(matchesFilter(10, filter("lt", 10))).toBe(false);
    expect(matchesFilter(10, filter("lte", 10))).toBe(true);
    expect(matchesFilter("9", filter("gt", 10))).toBe(false);
    expect(matchesFilter("100", filter("gt", 9))).toBe(true);
  });

  it("orders strings lexicographically and case-insensitively", () => {
    expect(matchesFilter("b", filter("gt", "A"))).toBe(true);
    expect(matchesFilter("2024-01-01", filter("gte", "2023-12-31"))).toBe(true);
    expect(matchesFilter("2024-01-01", filter("lt", "2024-01-01"))).toBe(false);
    expect(matchesFilter("2024-01-01", filter("lte", "2024-01-01"))).toBe(true);
  });

  it("never matches when a numeric comparison has a non-number", () => {
    for (const op of ["gt", "gte", "lt", "lte"] as const) {
      expect(matchesFilter("ten", filter(op, 10)), op).toBe(false);
    }
  });
});

describe("matchesFilter: fuzzy", () => {
  it("tolerates casing, punctuation, extra whitespace and placeholder brackets in either direction", () => {
    expect(matchesFilter("Corporate 1", filter("fuzzy", "corporate 1"))).toBe(true);
    expect(matchesFilter("[Corporate 1]", filter("fuzzy", "Corporate 1"))).toBe(true);
    expect(matchesFilter("Corporate-1", filter("fuzzy", "corporate 1"))).toBe(true);
    expect(matchesFilter("Corporate   1", filter("fuzzy", "Corporate 1"))).toBe(true);
    expect(matchesFilter("Corporate 1", filter("fuzzy", "[Corporate 1]"))).toBe(true);
    expect(matchesFilter("Corporate 1", filter("fuzzy", "Corporate"))).toBe(true);
    expect(matchesFilter("Corporate", filter("fuzzy", "Corporate 1 Holdings"))).toBe(true);
  });

  it("is not an edit-distance match, so sibling labels stay distinct", () => {
    expect(matchesFilter("Sub 1 Ltd", filter("fuzzy", "Sub 3 Ltd"))).toBe(false);
    expect(matchesFilter("Corporate 1", filter("fuzzy", "Corprate"))).toBe(false);
    expect(matchesFilter("zzzz", filter("fuzzy", "Corporate"))).toBe(false);
  });

  it("matches everything for an empty needle and nothing for an empty label", () => {
    expect(matchesFilter("anything", filter("fuzzy", ""))).toBe(true);
    expect(matchesFilter("", filter("fuzzy", "x"))).toBe(false);
    expect(matchesFilter("---", filter("fuzzy", "x"))).toBe(false);
  });

  it("handles non-Latin letters", () => {
    expect(matchesFilter("Société Générale", filter("fuzzy", "société"))).toBe(true);
    expect(matchesFilter("東京 株式会社", filter("fuzzy", "東京"))).toBe(true);
  });
});
