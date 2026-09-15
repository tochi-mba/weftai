import { describe, expect, it } from "vitest";
import { VERSION, z } from "./index.js";

describe("agentweft skeleton", () => {
  it("exports a version string", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("re-exports zod so consumers share one copy", () => {
    expect(z.string().parse("ok")).toBe("ok");
  });
});
