import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { defineOperation, defineOperationFor, provenanceType } from "./operation.js";
import { ref } from "./schema/ref.js";
import { type Collection, collection, groups, value, withSources } from "./schema/types.js";

const Node = z.object({ id: z.string(), label: z.string() });
type Node = z.infer<typeof Node>;
const Nodes = collection("nodes", Node, { label: (n) => n.label, key: (n) => n.id });
type Ctx = { readonly nodes: readonly Node[] };
const define = defineOperationFor<Ctx>();

const find = define({
  name: "nodes.find",
  description: "  Find nodes by label.  ",
  input: z.object({ label: z.string().optional() }),
  output: Nodes,
  examples: [{ input: { label: "A" }, note: "exact label" }],
  run: ({ input, ctx }) =>
    ctx.nodes.filter((n) => input.label === undefined || n.label === input.label),
});

describe("defineOperation", () => {
  it("fills defaults and trims the description", () => {
    expect(find).toMatchObject({ kind: "operation", effects: "read", present: "auto" });
    expect(find.description).toBe("Find nodes by label.");
    expect(find.examples).toHaveLength(1);
  });

  it("types resolved references inside run", () => {
    const count = define({
      name: "nodes.count",
      description: "Count nodes.",
      input: z.object({ from: ref(Nodes) }),
      output: value(z.number()),
      sources: Nodes,
      run: ({ input }) => {
        expectTypeOf(input.from).toEqualTypeOf<Collection<Node>>();
        return withSources(input.from.count, Nodes, input.from.items);
      },
    });
    expect(provenanceType(count)).toBe(Nodes);
    expect(provenanceType(find)).toBe(Nodes);
    const byLabel = define({
      name: "nodes.countBy",
      description: "Group.",
      input: z.object({ from: ref(Nodes) }),
      output: groups(),
      run: () => [],
    });
    expect(provenanceType(byLabel)).toBeUndefined();
  });

  it("rejects malformed definitions with a sentence that names the fix", () => {
    const base = { description: "d", input: z.object({}), output: Nodes, run: () => [] };
    expect(() => defineOperation({ ...base, name: "find" })).toThrow(/namespaced/);
    expect(() => defineOperation({ ...base, name: "nodes.find", description: " " })).toThrow(
      /needs a description/,
    );
    expect(() =>
      defineOperation({ ...base, name: "nodes.find", input: z.string() as never }),
    ).toThrow(/must be an object schema/);
    expect(() => defineOperation({ ...base, name: "nodes.find", sources: Nodes })).toThrow(
      /redundant/,
    );
    expect(() =>
      defineOperation({
        ...base,
        name: "nodes.find",
        input: z.object({ n: z.number() }),
        examples: [{ input: { n: "x" as never } }],
      }),
    ).toThrow(/example 1 does not match/);
  });
});
