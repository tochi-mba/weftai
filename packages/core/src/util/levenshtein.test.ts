import { describe, expect, it } from "vitest";
import { closest, levenshtein } from "./levenshtein.js";

describe("levenshtein", () => {
  it("computes classic distances", () => {
    expect(levenshtein("", "")).toBe(0);
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("flaw", "lawn")).toBe(2);
    expect(levenshtein("abc", "")).toBe(3);
  });
});

describe("closest", () => {
  it("suggests a near miss and ignores case", () => {
    expect(closest("owner", ["owned", "acme", "delaware"])).toBe("owned");
    expect(closest("Jurisdicton", ["Jurisdiction", "label"])).toBe("Jurisdiction");
  });

  it("returns undefined when nothing is close", () => {
    expect(closest("zzzz", ["owned", "acme"])).toBeUndefined();
  });

  it("prefers the nearest of several candidates", () => {
    expect(closest("nodes.fin", ["nodes.find", "nodes.filter", "edges.find"])).toBe("nodes.find");
  });
});
