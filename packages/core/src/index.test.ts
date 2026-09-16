import { describe, expect, it } from "vitest";
import { createRuntime, VERSION, z } from "./index.js";

describe("agentweft public exports", () => {
  it("exports a version string", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("re-exports zod so consumers share one copy", () => {
    expect(z.string().parse("ok")).toBe("ok");
  });

  it("exports the runtime constructor", () => {
    expect(typeof createRuntime).toBe("function");
  });
});
