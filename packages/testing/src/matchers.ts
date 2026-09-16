import type { ExecutionResult } from "agentweft";
import { expect } from "vitest";
import { stepById } from "./index.js";

interface AgentweftMatchers<R = unknown> {
  toHaveMatched(id: string, n: number): R;
  toHaveNotice(id: string, pattern: string | RegExp): R;
  toHaveFailed(id: string, pattern: string | RegExp): R;
}

declare module "vitest" {
  // Vitest's Assertion is declared with `T = any`; the parameters must match.
  // biome-ignore lint/suspicious/noExplicitAny: must match vitest's Assertion type parameters
  interface Assertion<T = any> extends AgentweftMatchers<T> {}
  interface AsymmetricMatchersContaining extends AgentweftMatchers {}
}

expect.extend({
  toHaveMatched(received: ExecutionResult<unknown>, id: string, n: number) {
    const step = stepById(received, id);
    const pass = step.count === n;
    return {
      pass,
      message: () =>
        pass
          ? `expected step '${id}' not to have matched ${n}`
          : `expected step '${id}' to have matched ${n}, got ${step.count ?? "no count"}`,
    };
  },
  toHaveNotice(received: ExecutionResult<unknown>, id: string, pattern: string | RegExp) {
    const step = stepById(received, id);
    const pass = step.notices.some((notice) =>
      typeof pattern === "string" ? notice.includes(pattern) : pattern.test(notice),
    );
    return {
      pass,
      message: () =>
        pass
          ? `expected step '${id}' not to have a notice matching ${String(pattern)}`
          : `expected step '${id}' to have a notice matching ${String(pattern)}. Notices: ${step.notices.join(" | ") || "(none)"}`,
    };
  },
  toHaveFailed(received: ExecutionResult<unknown>, id: string, pattern: string | RegExp) {
    const step = stepById(received, id);
    const message = step.error ?? "";
    const matched = typeof pattern === "string" ? message.includes(pattern) : pattern.test(message);
    const pass = step.status === "error" && matched;
    return {
      pass,
      message: () =>
        pass
          ? `expected step '${id}' not to fail matching ${String(pattern)}`
          : `expected step '${id}' to fail matching ${String(pattern)}. status=${step.status} error=${message}`,
    };
  },
});
