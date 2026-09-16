import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { REF_SYNTAX_RULE } from "../refs/syntax.js";
import { isRefSchema, type Ref, type RefMeta, type Resolved, ref, refMeta } from "./ref.js";
import { type Collection, collection } from "./types.js";

const Node = z.object({ id: z.string(), label: z.string() });
type Node = z.infer<typeof Node>;
const Nodes = collection("nodes", Node, { label: (n) => n.label });

describe("ref", () => {
  it("is a string schema that validates the reference grammar", () => {
    const schema = ref(Nodes);
    expect(schema.safeParse("$owned").success).toBe(true);
    expect(schema.safeParse("$owned[1,2]").success).toBe(true);
    expect(schema.safeParse("$owned[ 1 , 2 ]").success).toBe(true);
    expect(schema.safeParse("owned").success).toBe(false);
    expect(schema.safeParse("$owned[]").success).toBe(false);
    expect(schema.safeParse(3).success).toBe(false);
    expect(schema.safeParse(null).success).toBe(false);
  });

  it("explains the grammar when the string does not match", () => {
    const result = ref(Nodes).safeParse("owned");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe(REF_SYNTAX_RULE);
  });

  it("carries its target privately and describes it for the model", () => {
    const schema = ref(Nodes);
    expect(isRefSchema(schema)).toBe(true);
    expect(refMeta(schema)).toEqual({ kind: "ref", target: Nodes });
    expect(schema.description).toBe(
      'Reference to an earlier step\'s nodes result: "$stepId", or "$stepId[1,3]" for specific positions.',
    );
  });

  it("accepts any collection when no target is given", () => {
    const schema = ref();
    expect(refMeta(schema)).toEqual({ kind: "ref", target: undefined });
    expect(schema.description).toBe(
      'Reference to an earlier step\'s result: "$stepId", or "$stepId[1,3]" for specific positions.',
    );
  });

  it("lets a custom description replace the default", () => {
    expect(ref(Nodes, { description: "The parent." }).description).toBe("The parent.");
    expect(ref({ description: "Anything." }).description).toBe("Anything.");
    expect(refMeta(ref({ description: "Anything." }))?.target).toBeUndefined();
  });

  it("creates a distinct schema per call", () => {
    const a = ref(Nodes);
    const b = ref(Nodes);
    expect(a).not.toBe(b);
    expect(isRefSchema(a) && isRefSchema(b)).toBe(true);
  });

  it("does not mark wrappers or unrelated schemas", () => {
    expect(isRefSchema(ref(Nodes).optional())).toBe(false);
    expect(isRefSchema(z.string())).toBe(false);
    expect(refMeta(z.string())).toBeUndefined();
    expect(isRefSchema(z.string().regex(/^\$/))).toBe(false);
  });

  it("stamps a global symbol so a second copy of this module can still see the ref", () => {
    const schema = ref(Nodes);
    const stamped = (schema as unknown as Record<symbol, RefMeta | undefined>)[
      Symbol.for("agentweft.ref")
    ];
    expect(stamped).toEqual({ kind: "ref", target: Nodes });
  });

  it("does not leak private metadata into Zod's global registry beyond the description", () => {
    const meta = z.globalRegistry.get(ref(Nodes));
    expect(Object.keys(meta ?? {})).toEqual(["description"]);
  });
});

describe("Ref and Resolved types", () => {
  it("a Ref is still a string for the model-facing side", () => {
    const text: string = "$x" as Ref<Node>;
    expect(text).toBe("$x");
    expectTypeOf<Ref<Node>>().toMatchTypeOf<string>();
  });

  it("maps refs to collections and leaves everything else alone", () => {
    const input = z.object({
      from: ref(Nodes),
      many: z.array(ref(Nodes)),
      maybe: ref(Nodes).optional(),
      nested: z.object({ to: ref(Nodes) }),
      plain: z.string(),
      numbers: z.array(z.number()),
      byKey: z.record(z.string(), ref(Nodes)),
      either: z.union([ref(Nodes), z.literal("all")]),
      nothing: z.null(),
      when: z.date(),
    });
    type R = Resolved<z.output<typeof input>>;
    expectTypeOf<R["from"]>().toEqualTypeOf<Collection<Node>>();
    expectTypeOf<R["many"]>().toEqualTypeOf<readonly Collection<Node>[]>();
    expectTypeOf<R["maybe"]>().toEqualTypeOf<Collection<Node> | undefined>();
    expectTypeOf<R["nested"]["to"]>().toEqualTypeOf<Collection<Node>>();
    expectTypeOf<R["plain"]>().toEqualTypeOf<string>();
    expectTypeOf<R["numbers"]>().toEqualTypeOf<readonly number[]>();
    expectTypeOf<R["byKey"]>().toEqualTypeOf<Record<string, Collection<Node>>>();
    expectTypeOf<R["either"]>().toEqualTypeOf<Collection<Node> | "all">();
    expectTypeOf<R["nothing"]>().toEqualTypeOf<null>();
    expectTypeOf<R["when"]>().toEqualTypeOf<Date>();
  });

  it("keeps optional keys optional", () => {
    const input = z.object({ maybe: ref(Nodes).optional(), sure: ref(Nodes) });
    type R = Resolved<z.output<typeof input>>;
    expectTypeOf<R>().toEqualTypeOf<{
      maybe?: Collection<Node> | undefined;
      sure: Collection<Node>;
    }>();
  });

  it("resolves an untargeted ref to an unknown-item collection", () => {
    type R = Resolved<z.output<ReturnType<typeof ref>>>;
    expectTypeOf<R>().toEqualTypeOf<Collection<unknown>>();
  });
});
