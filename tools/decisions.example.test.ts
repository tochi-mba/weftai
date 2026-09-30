import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Answers, Gate } from "weftai";

/**
 * The decisions guide opens with an example whose results are written as comments beside each
 * call. The example is copied out of the page into a scratch module and run, and each commented
 * result is checked, so the page cannot drift from what the code does.
 */

const PAGE = new URL("../docs/decisions.md", import.meta.url);
const SCRATCH = new URL("../.tmp/", import.meta.url);

describe("the decisions guide", () => {
  it("runs its opening example and gets the results its comments give", async () => {
    const markdown = readFileSync(PAGE, "utf8");
    const example = /```ts\n([\s\S]*?)```/.exec(markdown)?.[1];
    expect(example, "docs/decisions.md has no ```ts block").toBeDefined();
    mkdirSync(SCRATCH, { recursive: true });
    const module = new URL("decisions-example.ts", SCRATCH);
    writeFileSync(module, `${example}\nexport { answers, routing };\n`);

    const { answers, routing } = (await import(/* @vite-ignore */ fileURLToPath(module))) as {
      answers: Answers;
      routing: Gate<string>;
    };

    expect(routing.decide(answers, "queue", answers.choice("queue"))).toBe("billing");
    expect(answers.noul("urgent")).toBe(false);
    expect(answers.score("severity", "moderate")).toBe("moderate");
  });
});
