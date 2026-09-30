import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The core package's README is the npm page most people read first, so its quick start must run
 * exactly as written and print exactly the output it shows. The example is copied out of the
 * README into a scratch module and imported, rather than kept twice, so the two cannot drift.
 */

const README = new URL("../packages/core/README.md", import.meta.url);
const SCRATCH = new URL("../.tmp/", import.meta.url);

function fenced(markdown: string, language: string): string {
  const match = new RegExp("```" + language + "\\n([\\s\\S]*?)```").exec(markdown);
  if (!match?.[1]) throw new Error(`the README has no \`\`\`${language} block`);
  return match[1];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the core README", () => {
  it("runs its quick start as written and prints the output it shows", async () => {
    const markdown = readFileSync(README, "utf8");
    mkdirSync(SCRATCH, { recursive: true });
    const module = new URL("readme-quick-start.ts", SCRATCH);
    writeFileSync(module, fenced(markdown, "ts"));
    const printed: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      printed.push(String(line));
    });

    await import(/* @vite-ignore */ fileURLToPath(module));

    expect(printed.join("\n")).toBe(fenced(markdown, "text").trimEnd());
  });
});
