import { describe, expect, it } from "vitest";
import * as api from "./index.js";

/**
 * The public surface is a contract. Adding an export means adding it here; removing one is a
 * breaking change that must be deliberate.
 */
const EXPECTED = [
  "Answers",
  "Batch",
  "Calibration",
  "DEFAULT_BUDGETS",
  "DEFAULT_LIMITS",
  "DEFAULT_SESSION_ID",
  "DEFAULT_STORE_LIMITS",
  "Decomposition",
  "DefinitionError",
  "FILTER_OPS",
  "Gate",
  "LimitExceededError",
  "MAX_LEVELS",
  "MAX_OPTIONS",
  "MAX_PROMPT",
  "MIN_LEVELS",
  "NullDecider",
  "OPERATION_NAME_PATTERN",
  "PlanSchema",
  "PlanStepSchema",
  "PlanValidationError",
  "QUESTION_ID",
  "REF_PATTERN_SOURCE",
  "RefResolutionError",
  "RegistryError",
  "STANDARD_OP_KINDS",
  "STEP_ID_PATTERN",
  "StepExecutionError",
  "TRACE_VERSION",
  "VERSION",
  "WeftaiError",
  "buildPlanSchema",
  "buildTrace",
  "choice",
  "collection",
  "createFormatter",
  "createMemoryStore",
  "createRegistry",
  "createRuntime",
  "defineOperation",
  "defineOperationFor",
  "describeOperations",
  "estimateTokens",
  "fieldNames",
  "formatIssue",
  "formatIssues",
  "formatProperty",
  "formatRef",
  "groups",
  "inputJsonSchema",
  "isRefSchema",
  "isStepOutput",
  "isValidOperationName",
  "isValidStepId",
  "makeCollection",
  "matchesFilter",
  "noul",
  "parseRef",
  "provenanceType",
  "ref",
  "refMeta",
  "resolveField",
  "resolveRef",
  "sanitizeLabel",
  "score",
  "sessionView",
  "standardOperations",
  "summarizeSchema",
  "validatePlan",
  "value",
  "withSources",
  "z",
].sort();

describe("public API", () => {
  it("exports exactly the documented surface", () => {
    expect(Object.keys(api).sort()).toEqual(EXPECTED);
  });

  it("exports callable constructors and helpers", () => {
    for (const name of EXPECTED) {
      expect((api as Record<string, unknown>)[name], name).toBeDefined();
    }
    expect(typeof api.createRuntime).toBe("function");
    expect(typeof api.defineOperation).toBe("function");
    expect(typeof api.z.object).toBe("function");
  });

  it("keeps the version in sync with package.json", async () => {
    const { readFileSync } = await import("node:fs");
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    };
    expect(api.VERSION).toBe(pkg.version);
  });

  it("uses a positive integer trace version", () => {
    expect(Number.isInteger(api.TRACE_VERSION)).toBe(true);
    expect(api.TRACE_VERSION).toBeGreaterThan(0);
  });

  it("exposes conservative default limits", () => {
    expect(api.DEFAULT_LIMITS).toEqual({
      maxSteps: 20,
      stepTimeoutMs: 10_000,
      planTimeoutMs: 60_000,
      maxParallel: 4,
    });
    expect(api.DEFAULT_STORE_LIMITS).toEqual({ ttlMs: 30 * 60 * 1000, maxResults: 200 });
    expect(api.DEFAULT_SESSION_ID).toBe("default");
  });
});
