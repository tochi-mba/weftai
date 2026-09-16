import { describe, expect, it } from "vitest";
import {
  AgentweftError,
  DefinitionError,
  LimitExceededError,
  PlanValidationError,
  RefResolutionError,
  RegistryError,
  StepExecutionError,
} from "./errors.js";

describe("error toJSON", () => {
  it("serialises the base error to name, code and message without a stack", () => {
    const json = new AgentweftError("x.y", "Boom.").toJSON();
    expect(json).toEqual({ name: "AgentweftError", code: "x.y", message: "Boom." });
    expect(JSON.parse(JSON.stringify(new AgentweftError("x.y", "Boom.")))).toEqual(json);
    expect(Object.keys(json)).not.toContain("stack");
  });

  it("uses the subclass name", () => {
    expect(new DefinitionError("d").toJSON().name).toBe("DefinitionError");
    expect(new RegistryError("registry.unknown", "u").toJSON()).toEqual({
      name: "RegistryError",
      code: "registry.unknown",
      message: "u",
    });
  });

  it("includes the issues of a validation error", () => {
    const error = new PlanValidationError([
      { code: "step.invalid_id", stepId: "a", message: "Bad.", hint: "Fix." },
    ]);
    const json = JSON.parse(JSON.stringify(error)) as { issues: unknown[]; message: string };
    expect(json.issues).toEqual([
      { code: "step.invalid_id", stepId: "a", message: "Bad.", hint: "Fix." },
    ]);
    expect(json.message).toBe("Step 'a': Bad. Fix.");
  });

  it("includes the reference and step of a resolution error", () => {
    expect(new RefResolutionError("$x[2]", "Missing.", "s").toJSON()).toEqual({
      name: "RefResolutionError",
      code: "ref.unresolved",
      message: "Missing.",
      ref: "$x[2]",
      stepId: "s",
    });
    expect(new RefResolutionError("$x", "m").toJSON().stepId).toBeUndefined();
  });

  it("includes the step and operation of an execution error, never the cause", () => {
    const cause = new Error("secret internals");
    const json = new StepExecutionError("s", "nodes.find", "Failed.", { cause }).toJSON();
    expect(json).toEqual({
      name: "StepExecutionError",
      code: "step.failed",
      message: "Failed.",
      stepId: "s",
      operation: "nodes.find",
    });
    expect(JSON.stringify(json)).not.toContain("secret internals");
  });

  it("includes the limit figures of a limit error", () => {
    expect(new LimitExceededError("maxItems", 12, 10, "Too many.").toJSON()).toEqual({
      name: "LimitExceededError",
      code: "limit.exceeded",
      message: "Too many.",
      limit: "maxItems",
      actual: 12,
      max: 10,
    });
  });
});
