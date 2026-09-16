import { describe, expect, it } from "vitest";
import { z } from "zod";
import { collection } from "../schema/types.js";
import { resolveField } from "./fields.js";
import { matchesFilter } from "./match.js";

const Node = z.object({
  id: z.string(),
  label: z.string(),
  entityType: z.string(),
});
type Node = z.infer<typeof Node>;
const Nodes = collection("nodes", Node, {
  label: (n) => n.label,
  fields: () => [
    { name: "label", aliases: ["name"], get: (n: Node) => n.label },
    { name: "entityType", aliases: ["type"], get: (n: Node) => n.entityType },
  ],
});
const item: Node = { id: "1", label: "Corporate 1", entityType: "Holding" };

describe("resolveField", () => {
  it("prefers an exact name over an alias", () => {
    const exact = resolveField(Nodes, "label", {});
    expect(exact.ok).toBe(true);
    if (exact.ok) expect(exact.field.name).toBe("label");
    const alias = resolveField(Nodes, "name", {});
    expect(alias.ok).toBe(true);
    if (alias.ok) expect(alias.field.name).toBe("label");
  });

  it("lists available fields and suggests a near miss", () => {
    const miss = resolveField(Nodes, "relationshipType", {});
    expect(miss.ok).toBe(false);
    if (miss.ok) return;
    expect(miss.message).toContain("Unknown field 'relationshipType' on nodes.");
    expect(miss.message).toContain("Available fields: label, entityType.");
    expect(miss.message).not.toContain("Did you mean");
    const near = resolveField(Nodes, "lable", {});
    expect(near.ok).toBe(false);
    if (!near.ok) expect(near.message).toContain("Did you mean 'label'?");
  });

  it("errors when the collection has no fields", () => {
    const bare = collection("things", Node, { label: (n) => n.label });
    const result = resolveField(bare, "label", {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("has no fields");
  });
});

describe("matchesFilter", () => {
  it("compares equality case-insensitively for strings", () => {
    expect(matchesFilter("Delaware", { field: "j", op: "eq", value: "delaware" })).toBe(true);
    expect(matchesFilter("Delaware", { field: "j", op: "ne", value: "UK" })).toBe(true);
  });

  it("matches contains, startsWith and fuzzy", () => {
    expect(matchesFilter("Sub 2 Ltd", { field: "l", op: "contains", value: "2" })).toBe(true);
    expect(matchesFilter("Corporate 1", { field: "l", op: "startsWith", value: "corp" })).toBe(
      true,
    );
    expect(matchesFilter("Corporate 1", { field: "l", op: "fuzzy", value: "corporate 1" })).toBe(
      true,
    );
    expect(matchesFilter("zzzz", { field: "l", op: "fuzzy", value: "Corporate" })).toBe(false);
  });

  it("orders numbers", () => {
    expect(matchesFilter(50, { field: "p", op: "gt", value: 40 })).toBe(true);
    expect(matchesFilter(50, { field: "p", op: "lte", value: 50 })).toBe(true);
    expect(matchesFilter(10, { field: "p", op: "gt", value: 40 })).toBe(false);
  });

  it("treats missing values as non-matches", () => {
    expect(matchesFilter(undefined, { field: "j", op: "eq", value: "Delaware" })).toBe(false);
    expect(matchesFilter(null, { field: "j", op: "ne", value: "Delaware" })).toBe(false);
  });

  it("reads a real node field", () => {
    expect(matchesFilter(item.label, { field: "label", op: "fuzzy", value: "Corporate" })).toBe(
      true,
    );
  });
});
