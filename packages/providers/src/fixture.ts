import { collection, createRegistry, createRuntime, defineOperation, z } from "weftai";

const Item = z.object({ id: z.string(), label: z.string() });
export const Items = collection("items", Item, {
  label: (item) => item.label,
});

export type SampleCtx = { readonly items: readonly z.infer<typeof Item>[] };

export const findItems = defineOperation({
  name: "items.find",
  description: "查找项目",
  input: z.object({ q: z.string().default("") }),
  output: Items,
  run: ({ input, ctx }: { input: { q: string }; ctx: SampleCtx }) =>
    ctx.items.filter((item) => item.label.includes(input.q)),
});

export const writeItems = defineOperation({
  name: "items.write",
  description: "Write items.",
  input: z.object({}),
  output: Items,
  effects: "write" as const,
  run: () => [],
});

export const sampleCtx: SampleCtx = { items: [{ id: "a", label: "Alpha" }] };

export const SAMPLE_PLAN = { steps: [{ id: "all", op: "items.find" }] };

export function sampleRuntime() {
  return createRuntime({
    registry: createRegistry<SampleCtx>({ operations: [findItems, writeItems] }),
  });
}
