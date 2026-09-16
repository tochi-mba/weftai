import { describe, expect, it } from "vitest";
import { bindTimeout, mergeAbort, whenAborted } from "./signals.js";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

describe("whenAborted", () => {
  it("resolves with the abort reason", async () => {
    const controller = new AbortController();
    const pending = whenAborted(controller.signal);
    controller.abort("why");
    expect(await pending).toBe("why");
  });

  it("resolves immediately with the reason of an already-aborted signal", async () => {
    expect(await whenAborted(AbortSignal.abort("done"))).toBe("done");
  });
});

describe("mergeAbort", () => {
  it("never aborts with no sources", async () => {
    const merged = mergeAbort([]);
    await tick();
    expect(merged.signal.aborted).toBe(false);
  });

  it("keeps the first reason when several sources abort", () => {
    const a = new AbortController();
    const b = new AbortController();
    const merged = mergeAbort([a.signal, b.signal]);
    a.abort("first");
    b.abort("second");
    expect(merged.signal.reason).toBe("first");
  });

  it("stops registering listeners after an already-aborted source", () => {
    const later = new AbortController();
    const merged = mergeAbort([AbortSignal.abort("early"), later.signal]);
    expect(merged.signal.reason).toBe("early");
  });
});

describe("bindTimeout", () => {
  it("never fires without a timeout and without a parent", async () => {
    const bound = bindTimeout(undefined, undefined, () => "never");
    await tick();
    expect(bound.signal.aborted).toBe(false);
    bound.dispose();
  });

  it("treats an infinite timeout as no timeout", async () => {
    const bound = bindTimeout(undefined, Number.POSITIVE_INFINITY, () => "never");
    await tick();
    expect(bound.signal.aborted).toBe(false);
    bound.dispose();
  });

  it("stops listening to the parent after dispose", async () => {
    const parent = new AbortController();
    const bound = bindTimeout(parent.signal, undefined, () => "never");
    bound.dispose();
    parent.abort("late");
    await tick();
    expect(bound.signal.aborted).toBe(false);
  });

  it("calls the timeout factory once and uses its value as the reason", async () => {
    let calls = 0;
    const bound = bindTimeout(undefined, 1, () => {
      calls += 1;
      return new Error("timed out");
    });
    await whenAborted(bound.signal);
    expect(calls).toBe(1);
    expect((bound.signal.reason as Error).message).toBe("timed out");
    bound.dispose();
  });

  it("does not fire the timeout after the parent aborted first", async () => {
    const parent = new AbortController();
    let calls = 0;
    const bound = bindTimeout(parent.signal, 1, () => {
      calls += 1;
      return "timeout";
    });
    parent.abort("parent");
    await tick();
    expect(bound.signal.reason).toBe("parent");
    expect(calls).toBe(0);
    bound.dispose();
  });
});
