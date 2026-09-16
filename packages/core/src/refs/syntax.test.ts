import { describe, expect, it } from "vitest";
import {
  formatRef,
  looksLikeRef,
  parseRef,
  REF_PATTERN_SOURCE,
  REF_SYNTAX_RULE,
  REF_TOLERANT_PATTERN,
} from "./syntax.js";

function ok(text: string) {
  const result = parseRef(text);
  if (!result.ok) throw new Error(`expected '${text}' to parse: ${result.message}`);
  return result.ref;
}

function fail(text: string): string {
  const result = parseRef(text);
  if (result.ok) throw new Error(`expected '${text}' to be rejected`);
  return result.message;
}

describe("parseRef: accepted forms", () => {
  it("parses a whole-result reference", () => {
    expect(ok("$owned")).toEqual({ id: "owned", ordinals: undefined });
  });

  it("parses a single position", () => {
    expect(ok("$owned[2]")).toEqual({ id: "owned", ordinals: [2] });
  });

  it("parses several positions in the order written", () => {
    expect(ok("$owned[4,1,7]")).toEqual({ id: "owned", ordinals: [4, 1, 7] });
  });

  it("drops duplicate positions while keeping first-seen order", () => {
    expect(ok("$owned[4,1,4,7,1]").ordinals).toEqual([4, 1, 7]);
    expect(ok("$owned[1,1,1]").ordinals).toEqual([1]);
  });

  it("tolerates whitespace inside the brackets and around the whole reference", () => {
    expect(ok("$owned[ 1 , 2 ]").ordinals).toEqual([1, 2]);
    expect(ok("  $owned  ")).toEqual({ id: "owned", ordinals: undefined });
    expect(ok(" $owned[3] ").ordinals).toEqual([3]);
  });

  it("reads leading zeros as decimal", () => {
    expect(ok("$a[007]").ordinals).toEqual([7]);
    expect(ok("$a[010]").ordinals).toEqual([10]);
  });

  it("accepts large positions", () => {
    expect(ok("$a[123456789]").ordinals).toEqual([123456789]);
  });

  it("accepts every valid id shape", () => {
    for (const id of ["A", "_", "a1", "_9", "camelCase", "snake_case", "a".repeat(64)]) {
      expect(ok(`$${id}`).id).toBe(id);
    }
  });

  it("is case-sensitive on ids", () => {
    expect(ok("$Owned").id).toBe("Owned");
    expect(ok("$owned").id).toBe("owned");
  });
});

describe("parseRef: rejected forms", () => {
  it("rejects position zero with a 1-based hint that names the id", () => {
    expect(fail("$owned[0]")).toBe(
      "'$owned[0]' uses position 0, but positions are 1-based; use '$owned[1]' for the first item.",
    );
    expect(fail("$owned[1,0]")).toContain("positions are 1-based");
  });

  it("rejects malformed references with the grammar in the message", () => {
    for (const bad of [
      "owned",
      "$",
      "$$a",
      "$1abc",
      "$owned[]",
      "$owned[ ]",
      "$owned[a]",
      "$owned[1,]",
      "$owned[,1]",
      "$owned[1 2]",
      "$owned[-1]",
      "$owned[1.5]",
      "$owned.",
      "$owned[1][2]",
      "$owned [1]",
      "$owned[1]x",
      "$a-b",
      "$a.b",
      "$a b",
      "",
      "   ",
      "$é",
    ]) {
      const message = fail(bad);
      expect(message, bad).toContain(`'${bad}' is not a valid reference.`);
      expect(message, bad).toContain(REF_SYNTAX_RULE);
    }
  });

  it("rejects ids longer than 64 characters", () => {
    expect(parseRef(`$${"a".repeat(64)}`).ok).toBe(true);
    expect(parseRef(`$${"a".repeat(65)}`).ok).toBe(false);
  });
});

describe("patterns", () => {
  it("the strict JSON Schema pattern accepts canonical forms only", () => {
    const strict = new RegExp(REF_PATTERN_SOURCE);
    for (const good of ["$owned", "$owned[2]", "$owned[1,4,7]", "$_", "$A9"]) {
      expect(strict.test(good), good).toBe(true);
    }
    for (const bad of ["owned", "$owned[1, 2]", " $owned", "$owned[]", "$owned[1"]) {
      expect(strict.test(bad), bad).toBe(false);
    }
  });

  it("the strict pattern is a valid ECMAScript regex without flags, as JSON Schema requires", () => {
    expect(() => new RegExp(REF_PATTERN_SOURCE)).not.toThrow();
    expect(REF_PATTERN_SOURCE.startsWith("^")).toBe(true);
    expect(REF_PATTERN_SOURCE.endsWith("$")).toBe(true);
  });

  it("the tolerant pattern accepts everything the strict one does plus whitespace", () => {
    for (const good of ["$owned", "$owned[2]", "$owned[ 1 , 2 ]", " $owned ", "$a[1 ,2]"]) {
      expect(REF_TOLERANT_PATTERN.test(good), good).toBe(true);
    }
    for (const bad of ["owned", "$owned[]", "$owned [1]", "$owned[1,]", "$1"]) {
      expect(REF_TOLERANT_PATTERN.test(bad), bad).toBe(false);
    }
  });

  it("agrees with the parser on acceptance for tolerant forms", () => {
    for (const text of ["$a", "$a[1]", "$a[ 1,2 ]", " $a ", "$a[", "$a]", "a", "$a[x]"]) {
      expect(REF_TOLERANT_PATTERN.test(text), text).toBe(parseRef(text).ok || text === "$a[0]");
    }
  });
});

describe("formatRef", () => {
  it("round-trips canonical forms", () => {
    for (const text of ["$owned", "$owned[2]", "$owned[1,4,7]"]) {
      expect(formatRef(ok(text))).toBe(text);
    }
  });

  it("normalises whitespace and duplicates", () => {
    expect(formatRef(ok(" $owned[ 2 , 2 , 1 ] "))).toBe("$owned[2,1]");
  });

  it("treats an empty ordinal list as the whole result", () => {
    expect(formatRef({ id: "a", ordinals: [] })).toBe("$a");
    expect(formatRef({ id: "a", ordinals: undefined })).toBe("$a");
  });
});

describe("looksLikeRef", () => {
  it("is a cheap pre-check on the leading dollar", () => {
    expect(looksLikeRef("$x")).toBe(true);
    expect(looksLikeRef("$")).toBe(true);
    expect(looksLikeRef("x")).toBe(false);
    expect(looksLikeRef("")).toBe(false);
    expect(looksLikeRef(" $x")).toBe(false);
  });

  it("rejects non-strings", () => {
    for (const value of [3, null, undefined, {}, [], true, Symbol("$")]) {
      expect(looksLikeRef(value)).toBe(false);
    }
  });
});

describe("REF_SYNTAX_RULE", () => {
  it("shows all three forms and says positions are 1-based", () => {
    expect(REF_SYNTAX_RULE).toContain("'$stepId'");
    expect(REF_SYNTAX_RULE).toContain("'$stepId[2]'");
    expect(REF_SYNTAX_RULE).toContain("'$stepId[1,4,7]'");
    expect(REF_SYNTAX_RULE).toContain("1-based");
  });
});
