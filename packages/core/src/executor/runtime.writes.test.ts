import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineOperationFor } from "../operation.js";
import { createRegistry } from "../registry.js";
import { value } from "../schema/types.js";
import { createRuntime } from "./runtime.js";

/**
 * Writes run one at a time, in the order the plan wrote them, and nothing runs beside them. The
 * operations record when they start and finish, so an overlap shows up as an interleaved log.
 */
function recording() {
  const log: string[] = [];
  const define = defineOperationFor<undefined>();
  const step = (name: string, effects: "read" | "write") =>
    define({
      name,
      description: `${name}.`,
      input: z.object({ tag: z.string(), fail: z.boolean().default(false) }),
      output: value(z.string()),
      effects,
      run: async ({ input }) => {
        log.push(`start ${input.tag}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        log.push(`end ${input.tag}`);
        if (input.fail) throw new Error("refused");
        return input.tag;
      },
    });
  const registry = createRegistry({
    operations: [step("things.read", "read"), step("things.write", "write")],
  });
  return { log, runtime: createRuntime({ registry }) };
}

describe("writes in a plan", () => {
  it("run one at a time in plan order, with nothing beside them", async () => {
    const { log, runtime } = recording();
    const result = await runtime.execute(
      {
        steps: [
          { id: "r1", op: "things.read", input: { tag: "r1" } },
          { id: "r2", op: "things.read", input: { tag: "r2" } },
          { id: "w1", op: "things.write", input: { tag: "w1" } },
          { id: "w2", op: "things.write", input: { tag: "w2" } },
          { id: "r3", op: "things.read", input: { tag: "r3" } },
        ],
      },
      { ctx: undefined },
    );

    expect(result.ok).toBe(true);
    expect(log).toEqual([
      "start r1",
      "start r2",
      "end r1",
      "end r2",
      "start w1",
      "end w1",
      "start w2",
      "end w2",
      "start r3",
      "end r3",
    ]);
  });

  it("still run after an earlier write fails, because order is not a reference", async () => {
    const { log, runtime } = recording();
    const result = await runtime.execute(
      {
        steps: [
          { id: "w1", op: "things.write", input: { tag: "w1", fail: true } },
          { id: "w2", op: "things.write", input: { tag: "w2" } },
        ],
      },
      { ctx: undefined },
    );

    expect(result.steps.map((s) => s.status)).toEqual(["error", "ok"]);
    expect(log).toEqual(["start w1", "end w1", "start w2", "end w2"]);
  });
});
