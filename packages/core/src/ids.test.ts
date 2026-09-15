import { describe, expect, it } from "vitest";
import { isValidOperationName, isValidStepId } from "./ids.js";

describe("step ids", () => {
  it("accept handles the model would naturally write", () => {
    for (const id of ["acme", "owned", "delawareSubs", "_tmp", "step_2", "a".repeat(64)]) {
      expect(isValidStepId(id), id).toBe(true);
    }
  });

  it("reject ids that would be ambiguous in references", () => {
    for (const id of ["", "2nd", "with space", "owned[1]", "$owned", "a-b", "a".repeat(65)]) {
      expect(isValidStepId(id), id).toBe(false);
    }
  });
});

describe("operation names", () => {
  it("require a namespace and lowerCamelCase segments", () => {
    for (const name of ["nodes.find", "contracts.expiringWithin", "a.b.c"]) {
      expect(isValidOperationName(name), name).toBe(true);
    }
    for (const name of [
      "find",
      "Nodes.find",
      "nodes.Find",
      "nodes.",
      "nodes..find",
      "nodes-find",
    ]) {
      expect(isValidOperationName(name), name).toBe(false);
    }
  });
});
