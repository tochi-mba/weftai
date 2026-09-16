import { describe, expect, it } from "vitest";
import { LimitExceededError } from "../errors.js";
import {
  bindTimeout,
  mergeAbort,
  planTimeoutError,
  stepTimeoutError,
  whenAborted,
} from "./signals.js";

describe("whenAborted", () => {
  it("resolves immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort("done");
    expect(await whenAborted(controller.signal)).toBe("done");
  });

  it("resolves when the signal aborts later", async () => {
    const controller = new AbortController();
    const pending = whenAborted(controller.signal);
    controller.abort("later");
    expect(await pending).toBe("later");
  });
});

describe("mergeAbort", () => {
  it("aborts when any source aborts", () => {
    const a = new AbortController();
    const b = new AbortController();
    const merged = mergeAbort([a.signal, b.signal]);
    expect(merged.signal.aborted).toBe(false);
    b.abort("b");
    expect(merged.signal.aborted).toBe(true);
    expect(merged.signal.reason).toBe("b");
  });

  it("aborts immediately when a source is already aborted", () => {
    const a = new AbortController();
    a.abort("pre");
    const merged = mergeAbort([a.signal, new AbortController().signal]);
    expect(merged.signal.reason).toBe("pre");
  });
});

describe("bindTimeout", () => {
  it("aborts from the parent without waiting for the timer", () => {
    const parent = new AbortController();
    const bound = bindTimeout(parent.signal, 10_000, () => "timeout");
    parent.abort("parent");
    expect(bound.signal.reason).toBe("parent");
    bound.dispose();
  });

  it("aborts with the timeout reason after the delay", async () => {
    const bound = bindTimeout(undefined, 20, () => "timeout");
    expect(await whenAborted(bound.signal)).toBe("timeout");
    bound.dispose();
  });

  it("does not abort after dispose", async () => {
    const bound = bindTimeout(undefined, 20, () => "timeout");
    bound.dispose();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(bound.signal.aborted).toBe(false);
  });

  it("inherits an already-aborted parent", () => {
    const parent = new AbortController();
    parent.abort("pre");
    const bound = bindTimeout(parent.signal, 1000, () => "timeout");
    expect(bound.signal.reason).toBe("pre");
    bound.dispose();
  });
});

describe("timeout errors", () => {
  it("name the limit and the fix", () => {
    const plan = planTimeoutError(60000);
    expect(plan).toBeInstanceOf(LimitExceededError);
    expect(plan.message).toBe(
      "The plan timed out after 60000ms. Split the work across calls or raise the plan timeout.",
    );
    expect(stepTimeoutError("owned", 10).message).toBe(
      "Step 'owned' timed out after 10ms. Narrow the query or raise the step timeout.",
    );
  });
});
