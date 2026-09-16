import { describe, expect, it } from "vitest";
import { z } from "zod";
import { collection } from "../schema/types.js";
import { fieldNames, resolveField } from "./fields.js";

const Row = z.object({ a: z.string(), b: z.number() });
type Row = z.infer<typeof Row>;
type Ctx = { readonly extra: readonly string[] };

const Rows = collection<Row, Ctx>("rows", Row, {
  label: (r) => r.a,
  fields: (ctx) => [
    { name: "alpha", aliases: ["a", "first"], get: (r) => r.a },
    { name: "beta", aliases: ["b"], get: (r) => r.b },
    ...ctx.extra.map((name) => ({ name, get: () => name })),
  ],
});
const ctx: Ctx = { extra: [] };

describe("resolveField", () => {
  it("resolves any alias to its field", () => {
    for (const alias of ["a", "first"]) {
      const result = resolveField(Rows, alias, ctx);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.field.name).toBe("alpha");
    }
  });

  it("is case-sensitive on names and aliases", () => {
    const result = resolveField(Rows, "Alpha", ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Did you mean 'alpha'?");
  });

  it("suggests an alias when it is the nearest name", () => {
    const result = resolveField(Rows, "firs", ctx);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.message).toBe(
        "Unknown field 'firs' on rows. Available fields: alpha, beta. Did you mean 'first'?",
      );
  });

  it("lists only real field names, not aliases, as available", () => {
    const result = resolveField(Rows, "zzzzzz", ctx);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.message).toBe("Unknown field 'zzzzzz' on rows. Available fields: alpha, beta.");
  });

  it("derives the catalogue from the context every time", () => {
    const withExtra: Ctx = { extra: ["gamma"] };
    expect(resolveField(Rows, "gamma", withExtra).ok).toBe(true);
    expect(resolveField(Rows, "gamma", ctx).ok).toBe(false);
  });

  it("prefers the first field when two declare the same alias", () => {
    const Dup = collection("dup", Row, {
      label: (r) => r.a,
      fields: () => [
        { name: "one", aliases: ["x"], get: (r) => r.a },
        { name: "two", aliases: ["x"], get: (r) => r.b },
      ],
    });
    const result = resolveField(Dup, "x", {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.field.name).toBe("one");
  });
});

describe("fieldNames", () => {
  it("lists names in catalogue order and none for a bare collection", () => {
    expect(fieldNames(Rows, { extra: ["gamma"] })).toEqual(["alpha", "beta", "gamma"]);
    expect(fieldNames(collection("bare", Row, { label: (r) => r.a }), {})).toEqual([]);
  });
});
