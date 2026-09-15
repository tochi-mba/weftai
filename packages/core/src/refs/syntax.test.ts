import { describe, expect, it } from "vitest";
import { formatRef, looksLikeRef, parseRef, REF_PATTERN_SOURCE } from "./syntax.js";

describe("parseRef", () => {
  it("parses a whole-result reference", () => {
    expect(parseRef("$owned")).toEqual({ ok: true, ref: { id: "owned", ordinals: undefined } });
  });

  it("parses a single position", () => {
    expect(parseRef("$owned[2]")).toEqual({ ok: true, ref: { id: "owned", ordinals: [2] } });
  });

  it("parses several positions and drops duplicates while keeping order", () => {
    expect(parseRef("$owned[4, 1,4 ,7]")).toEqual({
      ok: true,
      ref: { id: "owned", ordinals: [4, 1, 7] },
    });
  });

  it("rejects position zero with a 1-based hint", () => {
    const result = parseRef("$owned[0]");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("positions are 1-based; use '$owned[1]'");
  });

  it("rejects malformed references with the grammar in the message", () => {
    for (const bad of ["owned", "$", "$1abc", "$owned[]", "$owned[a]", "$owned[1,]", "$owned."]) {
      const result = parseRef(bad);
      expect(result.ok, bad).toBe(false);
      if (!result.ok) expect(result.message).toContain("References look like '$stepId'");
    }
  });

  it("rejects ids longer than 64 characters", () => {
    expect(parseRef(`$${"a".repeat(64)}`).ok).toBe(true);
    expect(parseRef(`$${"a".repeat(65)}`).ok).toBe(false);
  });

  it("agrees with the JSON Schema pattern on the canonical forms", () => {
    const re = new RegExp(REF_PATTERN_SOURCE);
    expect(re.test("$owned")).toBe(true);
    expect(re.test("$owned[2]")).toBe(true);
    expect(re.test("$owned[1,4,7]")).toBe(true);
    expect(re.test("owned")).toBe(false);
  });
});

describe("formatRef", () => {
  it("round-trips", () => {
    for (const text of ["$owned", "$owned[2]", "$owned[1,4,7]"]) {
      const parsed = parseRef(text);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(formatRef(parsed.ref)).toBe(text);
    }
  });
});

describe("looksLikeRef", () => {
  it("is a cheap pre-check on the leading dollar", () => {
    expect(looksLikeRef("$x")).toBe(true);
    expect(looksLikeRef("x")).toBe(false);
    expect(looksLikeRef(3)).toBe(false);
  });
});
