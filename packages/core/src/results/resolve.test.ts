import { describe, expect, it } from "vitest";
import { RefResolutionError } from "../errors.js";
import { parseRef } from "../refs/syntax.js";
import { resolveRef } from "./resolve.js";
import type { StoredResult } from "./types.js";

const nodes: StoredResult = {
  id: "owned",
  operation: "nodes.find",
  kind: "collection",
  type: "nodes",
  data: [
    { id: "1", label: "A" },
    { id: "2", label: "B" },
    { id: "3", label: "C" },
  ],
  items: [
    { id: "1", label: "A" },
    { id: "2", label: "B" },
    { id: "3", label: "C" },
  ],
  count: 3,
  notices: [],
  storedAt: 0,
};

function ref(text: string) {
  const parsed = parseRef(text);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.ref;
}

describe("resolveRef", () => {
  it("returns the full set for a whole-result reference", () => {
    const collection = resolveRef(nodes, ref("$owned"));
    expect(collection).toEqual({ type: "nodes", count: 3, items: nodes.items });
    expect(Object.isFrozen(collection.items)).toBe(true);
  });

  it("picks 1-based positions in the order written", () => {
    expect(resolveRef(nodes, ref("$owned[2]")).items).toEqual([{ id: "2", label: "B" }]);
    expect(resolveRef(nodes, ref("$owned[3,1]")).items).toEqual([
      { id: "3", label: "C" },
      { id: "1", label: "A" },
    ]);
  });

  it("uses the stored id as the type name when the result has no collection type", () => {
    const untyped: StoredResult = { ...nodes, type: undefined };
    expect(resolveRef(untyped, ref("$owned")).type).toBe("owned");
  });

  it("rejects a result with no items", () => {
    const value: StoredResult = {
      ...nodes,
      items: undefined,
      count: undefined,
      kind: "value",
      data: 3,
    };
    expect(() => resolveRef(value, ref("$owned"))).toThrow(RefResolutionError);
    expect(() => resolveRef(value, ref("$owned"))).toThrow(/no entities to reference/);
  });

  it("rejects a pick from an empty collection", () => {
    const empty: StoredResult = { ...nodes, items: [], data: [], count: 0 };
    expect(() => resolveRef(empty, ref("$owned[1]"))).toThrow(/is empty/);
  });

  it("rejects an ordinal past the end with the actual count in the message", () => {
    try {
      resolveRef(nodes, ref("$owned[4]"), "next");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(RefResolutionError);
      if (!(error instanceof RefResolutionError)) return;
      expect(error.stepId).toBe("next");
      expect(error.ref).toBe("$owned[4]");
      expect(error.message).toBe(
        "'$owned[4]' asks for position 4, but 'owned' holds 3 item(s). Use a position between 1 and 3.",
      );
    }
  });

  it("does not mutate the stored items when picking", () => {
    const snapshot = [...(nodes.items ?? [])];
    resolveRef(nodes, ref("$owned[1]"));
    expect(nodes.items).toEqual(snapshot);
  });
});
