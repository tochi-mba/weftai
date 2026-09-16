import { describe, expect, it } from "vitest";
import {
  AgentweftError,
  DefinitionError,
  formatIssue,
  formatIssues,
  LimitExceededError,
  type PlanIssue,
  PlanValidationError,
  RefResolutionError,
  RegistryError,
  StepExecutionError,
} from "./errors.js";

describe("AgentweftError", () => {
  it("carries a code, the message and the subclass name", () => {
    const error = new AgentweftError("x.y", "Something happened.");
    expect(error.code).toBe("x.y");
    expect(error.message).toBe("Something happened.");
    expect(error.name).toBe("AgentweftError");
    expect(error).toBeInstanceOf(Error);
  });

  it("passes a cause through", () => {
    const cause = new Error("root");
    expect(new AgentweftError("x", "m", { cause }).cause).toBe(cause);
    expect(new AgentweftError("x", "m").cause).toBeUndefined();
  });

  it("has a stack that names the class", () => {
    expect(new AgentweftError("x", "m").stack).toContain("AgentweftError");
  });

  it("serialises through JSON.stringify without leaking a stack", () => {
    expect(JSON.parse(JSON.stringify(new AgentweftError("x.y", "Something happened.")))).toEqual({
      name: "AgentweftError",
      code: "x.y",
      message: "Something happened.",
    });
  });

  it("uses the most derived class name for subclasses", () => {
    class Custom extends AgentweftError {
      constructor() {
        super("custom", "c");
      }
    }
    expect(new Custom().name).toBe("Custom");
  });
});

describe("DefinitionError", () => {
  it("uses the definition.invalid code", () => {
    const error = new DefinitionError("Bad definition.");
    expect(error.code).toBe("definition.invalid");
    expect(error.name).toBe("DefinitionError");
    expect(error.message).toBe("Bad definition.");
    expect(error).toBeInstanceOf(AgentweftError);
  });
});

describe("RegistryError", () => {
  it("keeps whichever registry code it is given", () => {
    expect(new RegistryError("registry.duplicate", "d").code).toBe("registry.duplicate");
    expect(new RegistryError("registry.unknown", "u").code).toBe("registry.unknown");
    expect(new RegistryError("registry.unknown", "u").name).toBe("RegistryError");
  });
});

describe("PlanValidationError", () => {
  it("exposes the issues and formats them into the message", () => {
    const issues: PlanIssue[] = [
      { code: "step.invalid_id", stepId: "a", message: "Bad id.", hint: "Fix it." },
      { code: "plan.too_many_steps", message: "Too many steps." },
    ];
    const error = new PlanValidationError(issues);
    expect(error.issues).toBe(issues);
    expect(error.message).toBe("Step 'a': Bad id. Fix it.\nToo many steps.");
    expect(error.code).toBe("plan.invalid");
    expect(error.name).toBe("PlanValidationError");
  });

  it("still has a message with no issues", () => {
    expect(new PlanValidationError([]).message).toBe("The plan is invalid.");
  });

  it("includes the issues in JSON", () => {
    const issues: PlanIssue[] = [{ code: "plan.too_many_steps", message: "Too many steps." }];
    expect(JSON.parse(JSON.stringify(new PlanValidationError(issues)))).toEqual({
      name: "PlanValidationError",
      code: "plan.invalid",
      message: "Too many steps.",
      issues,
    });
  });
});

describe("RefResolutionError", () => {
  it("records the reference and the step", () => {
    const error = new RefResolutionError("$x[2]", "Missing.", "s");
    expect(error.ref).toBe("$x[2]");
    expect(error.stepId).toBe("s");
    expect(error.code).toBe("ref.unresolved");
    expect(error.name).toBe("RefResolutionError");
  });

  it("allows an unknown step", () => {
    expect(new RefResolutionError("$x", "m").stepId).toBeUndefined();
  });

  it("includes the ref and step in JSON", () => {
    expect(JSON.parse(JSON.stringify(new RefResolutionError("$x[2]", "Missing.", "s")))).toEqual({
      name: "RefResolutionError",
      code: "ref.unresolved",
      message: "Missing.",
      ref: "$x[2]",
      stepId: "s",
    });
  });
});

describe("StepExecutionError", () => {
  it("records the step, the operation and the cause", () => {
    const cause = new TypeError("boom");
    const error = new StepExecutionError("owned", "nodes.descendants", "Failed.", { cause });
    expect(error.stepId).toBe("owned");
    expect(error.operation).toBe("nodes.descendants");
    expect(error.cause).toBe(cause);
    expect(error.code).toBe("step.failed");
    expect(error.name).toBe("StepExecutionError");
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      name: "StepExecutionError",
      code: "step.failed",
      message: "Failed.",
      stepId: "owned",
      operation: "nodes.descendants",
    });
  });
});

describe("LimitExceededError", () => {
  it("records the limit figures", () => {
    const error = new LimitExceededError("maxItems", 12, 10, "Too many items.");
    expect(error.limit).toBe("maxItems");
    expect(error.actual).toBe(12);
    expect(error.max).toBe(10);
    expect(error.code).toBe("limit.exceeded");
    expect(error.message).toBe("Too many items.");
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      name: "LimitExceededError",
      code: "limit.exceeded",
      message: "Too many items.",
      limit: "maxItems",
      actual: 12,
      max: 10,
    });
  });
});

describe("formatIssue", () => {
  it("renders just the message when there is no step or hint", () => {
    expect(formatIssue({ code: "plan.invalid_shape", message: "Malformed." })).toBe("Malformed.");
  });

  it("prefixes the step id", () => {
    expect(formatIssue({ code: "step.invalid_id", stepId: "a", message: "Bad." })).toBe(
      "Step 'a': Bad.",
    );
  });

  it("appends the hint", () => {
    expect(formatIssue({ code: "step.invalid_id", message: "Bad.", hint: "Fix." })).toBe(
      "Bad. Fix.",
    );
  });

  it("combines step and hint", () => {
    expect(
      formatIssue({ code: "step.invalid_id", stepId: "a", message: "Bad.", hint: "Fix." }),
    ).toBe("Step 'a': Bad. Fix.");
  });

  it("does not render the path separately because messages already name it", () => {
    expect(
      formatIssue({
        code: "step.invalid_input",
        stepId: "a",
        path: ["x"],
        message: "input.x: bad.",
      }),
    ).toBe("Step 'a': input.x: bad.");
  });

  it("treats an explicitly undefined step and hint like absent ones", () => {
    expect(
      formatIssue({
        code: "plan.invalid_shape",
        stepId: undefined,
        hint: undefined,
        message: "M.",
      }),
    ).toBe("M.");
  });
});

describe("formatIssues", () => {
  it("joins one line per issue", () => {
    expect(
      formatIssues([
        { code: "plan.invalid_shape", message: "One." },
        { code: "plan.invalid_shape", message: "Two." },
      ]),
    ).toBe("One.\nTwo.");
  });

  it("falls back to a generic sentence when empty", () => {
    expect(formatIssues([])).toBe("The plan is invalid.");
  });
});
