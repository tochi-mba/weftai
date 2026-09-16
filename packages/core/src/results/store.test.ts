import { describe, expect, it } from "vitest";
import { sessionView } from "./session.js";
import { createMemoryStore } from "./store.js";
import type { StoredResult } from "./types.js";

function stored(id: string, extras: Partial<StoredResult> = {}): StoredResult {
  return {
    id,
    operation: "nodes.find",
    kind: "collection",
    type: "nodes",
    data: extras.data ?? [{ id, label: id }],
    items: extras.items ?? [{ id, label: id }],
    count: extras.count ?? 1,
    notices: extras.notices ?? [],
    storedAt: extras.storedAt ?? 0,
    ...extras,
  };
}

describe("createMemoryStore", () => {
  it("round-trips a result and lists it in insertion order", () => {
    const store = createMemoryStore();
    store.set("s", stored("a"));
    store.set("s", stored("b"));
    expect(store.get("s", "a")?.id).toBe("a");
    expect(store.list("s").map((r) => r.id)).toEqual(["a", "b"]);
    expect(store.get("other", "a")).toBeUndefined();
    expect(store.list("other")).toEqual([]);
  });

  it("isolates sessions", () => {
    const store = createMemoryStore();
    store.set("one", stored("a"));
    store.set("two", stored("a", { data: [1], items: [1], count: 1 }));
    expect(store.get("one", "a")?.data).toEqual([{ id: "a", label: "a" }]);
    expect(store.get("two", "a")?.data).toEqual([1]);
  });

  it("freezes items so ordinals cannot drift after store", () => {
    const items = [{ id: "1", label: "A" }];
    const store = createMemoryStore();
    store.set("s", stored("a", { items, data: items, count: 1 }));
    items.push({ id: "2", label: "B" });
    expect(store.get("s", "a")?.items).toEqual([{ id: "1", label: "A" }]);
    expect(Object.isFrozen(store.get("s", "a")?.items)).toBe(true);
  });

  it("replaces an existing id and moves it to the newest position", () => {
    const store = createMemoryStore();
    store.set("s", stored("a"));
    store.set("s", stored("b"));
    const first = store.set("s", stored("a", { data: ["new"], items: ["new"], count: 1 }));
    expect(first.replaced).toBe(true);
    expect(first.evicted).toEqual([]);
    expect(store.list("s").map((r) => r.id)).toEqual(["b", "a"]);
    expect(store.get("s", "a")?.data).toEqual(["new"]);
  });

  it("evicts the oldest result when the session is at cap", () => {
    const store = createMemoryStore({ maxResults: 2 });
    store.set("s", stored("a"));
    store.set("s", stored("b"));
    const set = store.set("s", stored("c"));
    expect(set).toEqual({ replaced: false, evicted: ["a"], cap: 2 });
    expect(store.list("s").map((r) => r.id)).toEqual(["b", "c"]);
    expect(store.get("s", "a")).toBeUndefined();
  });

  it("does not evict when replacing at cap", () => {
    const store = createMemoryStore({ maxResults: 2 });
    store.set("s", stored("a"));
    store.set("s", stored("b"));
    const set = store.set("s", stored("b", { data: [2], items: [2], count: 1 }));
    expect(set.evicted).toEqual([]);
    expect(store.list("s").map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("expires results after ttl", () => {
    let t = 1000;
    const store = createMemoryStore({ ttlMs: 10, now: () => t });
    store.set("s", stored("a"));
    t = 1009;
    expect(store.get("s", "a")).toBeDefined();
    t = 1010;
    expect(store.get("s", "a")).toBeUndefined();
    expect(store.list("s")).toEqual([]);
  });

  it("never expires when ttl is Infinity", () => {
    let t = 1;
    const store = createMemoryStore({ ttlMs: Number.POSITIVE_INFINITY, now: () => t });
    store.set("s", stored("a"));
    t = 1e15;
    expect(store.get("s", "a")?.id).toBe("a");
  });

  it("purges expired entries before enforcing the cap", () => {
    let t = 0;
    const store = createMemoryStore({ maxResults: 1, ttlMs: 5, now: () => t });
    store.set("s", stored("old"));
    t = 6;
    const set = store.set("s", stored("new"));
    expect(set.evicted).toEqual([]);
    expect(store.list("s").map((r) => r.id)).toEqual(["new"]);
  });

  it("deletes one result and clears a session", () => {
    const store = createMemoryStore();
    store.set("s", stored("a"));
    store.set("s", stored("b"));
    expect(store.delete("s", "a")).toBe(true);
    expect(store.delete("s", "a")).toBe(false);
    expect(store.list("s").map((r) => r.id)).toEqual(["b"]);
    store.clear("s");
    expect(store.list("s")).toEqual([]);
    expect(store.delete("missing", "a")).toBe(false);
  });

  it("rejects a bad ttl or cap at construction", () => {
    expect(() => createMemoryStore({ ttlMs: 0 })).toThrow(/ttlMs/);
    expect(() => createMemoryStore({ ttlMs: -1 })).toThrow(/ttlMs/);
    expect(() => createMemoryStore({ maxResults: 0 })).toThrow(/maxResults/);
    expect(() => createMemoryStore({ maxResults: 1.5 })).toThrow(/maxResults/);
  });
});

describe("sessionView", () => {
  it("exposes has, ids, type and count for validation", () => {
    const store = createMemoryStore();
    store.set("s", stored("owned", { count: 3, items: [1, 2, 3], data: [1, 2, 3] }));
    store.set(
      "s",
      stored("total", {
        kind: "value",
        type: undefined,
        items: undefined,
        count: undefined,
        data: 3,
      }),
    );
    const view = sessionView(store, "s");
    expect(view.has("owned")).toBe(true);
    expect(view.has("nope")).toBe(false);
    expect(view.ids()).toEqual(["owned", "total"]);
    expect(view.typeOf("owned")).toBe("nodes");
    expect(view.typeOf("total")).toBeUndefined();
    expect(view.countOf("owned")).toBe(3);
    expect(view.countOf("nope")).toBeUndefined();
  });
});
