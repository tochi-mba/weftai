import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Repository rule: no source file grows past 1,000 lines. Large files hide structure and make
 * review harder; when one gets close, split it by responsibility.
 */
const MAX_LINES = 1000;
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "coverage", ".pnpm-store"]);
const SKIP_FILES = new Set(["pnpm-lock.yaml"]);
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".yaml", ".yml"]);

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path, out);
    } else if (EXTENSIONS.has(extname(entry.name)) && !SKIP_FILES.has(entry.name)) {
      out.push(path);
    }
  }
}

describe("repository hygiene", () => {
  it(`keeps every source file at or under ${MAX_LINES} lines`, () => {
    const files: string[] = [];
    walk(ROOT, files);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files
      .map((file) => ({
        file: relative(ROOT, file),
        lines: readFileSync(file, "utf8").split("\n").length,
      }))
      .filter((entry) => entry.lines > MAX_LINES);
    expect(offenders).toEqual([]);
  });
});
