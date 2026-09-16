import { describe, expect, it } from "vitest";
import {
  isValidOperationName,
  isValidStepId,
  OPERATION_NAME_PATTERN,
  OPERATION_NAME_RULE,
  STEP_ID_PATTERN,
  STEP_ID_RULE,
} from "./ids.js";

describe("step ids", () => {
  it("accept handles the model would naturally write", () => {
    for (const id of [
      "acme",
      "owned",
      "delawareSubs",
      "_tmp",
      "step_2",
      "A",
      "_",
      "a1",
      "camelCase",
    ]) {
      expect(isValidStepId(id), id).toBe(true);
    }
  });

  it("accept exactly 64 characters and reject 65", () => {
    expect(isValidStepId("a".repeat(64))).toBe(true);
    expect(isValidStepId("a".repeat(65))).toBe(false);
    expect(isValidStepId(`_${"9".repeat(63)}`)).toBe(true);
  });

  it("reject ids that would be ambiguous in references", () => {
    for (const id of [
      "",
      "2nd",
      "9",
      "with space",
      " a",
      "a ",
      "owned[1]",
      "$owned",
      "a-b",
      "a.b",
      "a/b",
      "é",
      "naïve",
      "a\tb",
      "a\nb",
      "a,b",
    ]) {
      expect(isValidStepId(id), JSON.stringify(id)).toBe(false);
    }
  });

  it("exposes the pattern used in JSON Schema", () => {
    expect(STEP_ID_PATTERN.source).toBe("^[A-Za-z_][A-Za-z0-9_]{0,63}$");
    expect(STEP_ID_PATTERN.flags).toBe("");
  });

  it("documents the rule in one sentence", () => {
    expect(STEP_ID_RULE).toMatch(/letter or underscore/);
    expect(STEP_ID_RULE).toMatch(/64/);
    expect(STEP_ID_RULE.endsWith(".")).toBe(true);
  });
});

describe("operation names", () => {
  it("require a namespace and lowerCamelCase segments", () => {
    for (const name of [
      "nodes.find",
      "contracts.expiringWithin",
      "a.b.c",
      "v2.find",
      "nodes.findAll2",
    ]) {
      expect(isValidOperationName(name), name).toBe(true);
    }
  });

  it("reject names without a namespace, with bad casing or bad separators", () => {
    for (const name of [
      "",
      "find",
      "Nodes.find",
      "nodes.Find",
      "nodes.",
      ".find",
      "nodes..find",
      "nodes-find",
      "nodes_find",
      "nodes.2find",
      "2nodes.find",
      "nodes find",
      "nodes.find ",
      " nodes.find",
      "nodes.find.",
      "nodes.fïnd",
    ]) {
      expect(isValidOperationName(name), JSON.stringify(name)).toBe(false);
    }
  });

  it("allows deep namespaces", () => {
    expect(isValidOperationName("a.b.c.d.e")).toBe(true);
  });

  it("exposes the pattern and the rule", () => {
    expect(OPERATION_NAME_PATTERN.test("nodes.find")).toBe(true);
    expect(OPERATION_NAME_RULE).toContain("nodes.find");
    expect(OPERATION_NAME_RULE.endsWith(".")).toBe(true);
  });
});
