import { describe, expect, it } from "vitest";
import { sessionView } from "./session.js";
import { createMemoryStore } from "./store.js";
import type { StoredResult } from "./types.js";

const stored = (id: string, extra: Partial<StoredResult> = {}): StoredResult => ({
  id,
  operation: "nodes.find",
  kind: "collection",
  type: "nodes",
  data: [],
  items: [{ label: "A" }, { label: "B" }],
  count: 2,
  notices: [],
  storedAt: 0,
  ...extra,
});

describe("sessionView", () => {
  it("answers has, ids, typeOf and countOf from the store", () => {
    const store = createMemoryStore();
    store.set("s", stored("owned"));
    store.set("s", stored("n", { kind: "value", data: 2 }));
    store.set(
      "s",
      stored("g", { kind: "groups", type: undefined, items: undefined, count: undefined }),
    );
    const view = sessionView(store, "s");
    expect(view.has("owned")).toBe(true);
    expect(view.has("nope")).toBe(false);
    expect(view.ids()).toEqual(["owned", "n", "g"]);
    expect(view.typeOf("owned")).toBe("nodes");
    expect(view.typeOf("g")).toBeUndefined();
    expect(view.typeOf("nope")).toBeUndefined();
    expect(view.countOf("owned")).toBe(2);
    expect(view.countOf("g")).toBeUndefined();
    expect(view.countOf("nope")).toBeUndefined();
  });

  it("is scoped to one session", () => {
    const store = createMemoryStore();
    store.set("a", stored("x"));
    const view = sessionView(store, "b");
    expect(view.has("x")).toBe(false);
    expect(view.ids()).toEqual([]);
  });

  it("reflects later changes to the store", () => {
    const store = createMemoryStore();
    const view = sessionView(store, "s");
    expect(view.has("x")).toBe(false);
    store.set("s", stored("x"));
    expect(view.has("x")).toBe(true);
    store.delete("s", "x");
    expect(view.has("x")).toBe(false);
  });
});
