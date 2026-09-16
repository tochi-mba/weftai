import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collection, createMemoryStore, createRegistry, defineOperation, z } from "agentweft";
import { afterAll, describe, expect, it } from "vitest";
import {
  createTestRuntime,
  formatSnapshot,
  loadFixture,
  stepById,
  toHaveFailed,
  toHaveMatched,
  toHaveNotice,
} from "./index.js";

const Item = z.object({ id: z.string(), label: z.string() });
const Items = collection("items", Item, { label: (item) => item.label, key: (item) => item.id });
type Ctx = { readonly items: readonly z.infer<typeof Item>[] };

const registry = createRegistry<Ctx>({
  operations: [
    defineOperation({
      name: "items.find",
      description: "Find.",
      input: z.object({}),
      output: Items,
      run: ({ ctx }: { ctx: Ctx }) => ctx.items,
    }),
  ],
});
const ctx: Ctx = { items: [{ id: "a", label: "Alpha" }] };

const dir = mkdtempSync(join(tmpdir(), "agentweft-testing-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("createTestRuntime", () => {
  it("exposes the runtime and context and forwards runtime options", async () => {
    const store = createMemoryStore();
    const test = createTestRuntime(registry, ctx, { store });
    expect(test.ctx).toBe(ctx);
    expect(test.runtime.store).toBe(store);
    await test.runSteps([{ id: "all", op: "items.find" }]);
    expect(store.get("default", "all")?.count).toBe(1);
  });

  it("passes extra execute options such as the session", async () => {
    const test = createTestRuntime(registry, ctx);
    await test.runSteps([{ id: "all", op: "items.find" }], { session: { id: "s" } });
    expect(test.runtime.store.get("s", "all")?.count).toBe(1);
    const result = await test.execute(
      { steps: [{ id: "x", op: "items.find" }] },
      { session: { id: "t" } },
    );
    expect(result.ok).toBe(true);
    expect(test.runtime.store.get("t", "x")?.count).toBe(1);
  });
});

describe("assertion helpers", () => {
  it("stepById throws with the known steps", async () => {
    const result = await createTestRuntime(registry, ctx).runSteps([
      { id: "all", op: "items.find" },
    ]);
    expect(stepById(result, "all").count).toBe(1);
    expect(() => stepById(result, "nope")).toThrow("No step 'nope' in the result. Steps: all.");
  });

  it("names the empty step list", async () => {
    const result = await createTestRuntime(registry, ctx).execute({
      steps: [{ id: "a", op: "items.nope" }],
    });
    expect(() => stepById(result, "a")).toThrow("Steps: (none).");
  });

  it("toHaveMatched, toHaveNotice and toHaveFailed throw with actionable messages", async () => {
    const result = await createTestRuntime(registry, ctx).runSteps([
      { id: "all", op: "items.find" },
    ]);
    expect(() => toHaveMatched(result, "all", 2)).toThrow(
      "Expected step 'all' to have matched 2, got 1.",
    );
    expect(() => toHaveNotice(result, "all", "x")).toThrow(/Notices: \(none\)/);
    expect(() => toHaveFailed(result, "all", "x")).toThrow(
      "Expected step 'all' to fail, but it was 'ok'.",
    );
    expect(() => toHaveNotice(result, "all", /x/)).toThrow(/matching \/x\//);
  });

  it("toHaveFailed checks the message pattern", async () => {
    const failing = createRegistry<Ctx>({
      operations: [
        defineOperation({
          name: "items.boom",
          description: "Fail.",
          input: z.object({}),
          output: Items,
          run: () => {
            throw new Error("kaboom");
          },
        }),
      ],
    });
    const result = await createTestRuntime(failing, ctx).runSteps([{ id: "x", op: "items.boom" }]);
    expect(() => toHaveFailed(result, "x", "other")).toThrow(
      /Expected step 'x' to fail matching other/,
    );
    expect(() => toHaveFailed(result, "x", /kaboom/)).not.toThrow();
  });

  it("formatSnapshot is the model-facing text", async () => {
    const result = await createTestRuntime(registry, ctx).runSteps([
      { id: "all", op: "items.find" },
    ]);
    expect(formatSnapshot(result)).toBe(result.text);
  });
});

describe("loadFixture", () => {
  it("reads JSON and throws on a missing file", () => {
    const path = join(dir, "fixture.json");
    writeFileSync(path, JSON.stringify({ items: [1, 2] }));
    expect(loadFixture<{ items: number[] }>(path).items).toEqual([1, 2]);
    expect(() => loadFixture(join(dir, "nope.json"))).toThrow();
  });
});
