import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as api from "weftai";

/**
 * `tools/surface.json` is the truth about what this package and the Python `weftai` package
 * export, and this keeps it true from the TypeScript side. The identical file and an
 * equivalent test live in the Python repository, so each side is checked against the same
 * snapshot without either needing to fetch the other during CI.
 *
 * This is the gap that let the Python root sit fifty type names behind this one for four
 * releases. `tools/parity.md` over there maps test file to test file, which keeps the two
 * *suites* aligned and says nothing about what either package exports.
 *
 * Regenerate with `python tools/surface.py --write` in the Python checkout, with both
 * repositories checked out as siblings, and copy the file here.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const INDEX = `${ROOT}packages/core/src/index.ts`;

interface Surface {
  version: string;
  shared: string[];
  python_only: Record<string, string>;
  typescript_only: Record<string, string>;
}

const surface = JSON.parse(readFileSync(`${ROOT}tools/surface.json`, "utf8")) as Surface;

/** Every name `index.ts` exports, from `export { ... }` blocks and direct declarations alike. */
function exportedNames(): Set<string> {
  const text = readFileSync(INDEX, "utf8");
  const names = new Set<string>();
  for (const block of text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/gs)) {
    const body = block[1];
    if (!body) continue;
    for (const raw of body.split(",")) {
      const spec = raw.trim().match(/^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([\w$]+))?$/);
      const name = spec?.[2] ?? spec?.[1];
      if (name) names.add(name);
    }
  }
  for (const direct of text.matchAll(
    /^export\s+(?:declare\s+)?(?:const|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    const name = direct[1];
    if (name) names.add(name);
  }
  return names;
}

describe("public surface parity", () => {
  it("carries the version the snapshot records", () => {
    // The two lines had drifted to npm 0.2.1 against PyPI 0.2.4 before anything compared
    // them, which makes "am I on matching versions?" unanswerable for anyone using both.
    // The Python repository asserts its own packaging against this same field.
    const pkg = JSON.parse(readFileSync(`${ROOT}packages/core/package.json`, "utf8")) as {
      version: string;
    };
    expect(pkg.version).toBe(surface.version);
    expect(api.VERSION).toBe(surface.version);
  });

  it("exports every shared name", () => {
    const exported = exportedNames();
    const missing = surface.shared.filter((name) => !exported.has(name));
    expect(missing, "in surface.json but not exported from index.ts").toEqual([]);
  });

  it("exports nothing that is not recorded", () => {
    const allowed = new Set([...surface.shared, ...Object.keys(surface.typescript_only)]);
    const extra = [...exportedNames()].filter((name) => !allowed.has(name)).sort();
    expect(
      extra,
      "exported but absent from surface.json. Add it to the Python package too, or record it under typescript_only with a reason.",
    ).toEqual([]);
  });

  it("keeps every recorded TypeScript-only name actually exported", () => {
    const exported = exportedNames();
    const stale = Object.keys(surface.typescript_only).filter((name) => !exported.has(name));
    expect(stale, "recorded as typescript_only but no longer exported").toEqual([]);
  });

  it("gives every deliberate difference a real reason", () => {
    // A bare list would let "they are different languages" stand in for an argument.
    for (const side of ["python_only", "typescript_only"] as const) {
      const entries = Object.entries(surface[side]);
      expect(
        entries.length,
        `${side} is empty; the two languages are not that similar`,
      ).toBeGreaterThan(0);
      for (const [name, reason] of entries) {
        expect(
          reason.length,
          `${side}[${name}] needs a real reason, not ${reason}`,
        ).toBeGreaterThan(30);
      }
    }
  });

  it("reaches the shared names at runtime, not only in the source text", () => {
    // The source scan proves index.ts says the name; this proves the module provides it.
    // Type-only exports vanish at runtime, so only the value exports are checked here.
    const runtime = new Set(Object.keys(api));
    const values = [
      "createRuntime",
      "defineOperation",
      "createRegistry",
      "validatePlan",
      "VERSION",
    ];
    for (const name of values) {
      expect(surface.shared, `${name} should be a shared name`).toContain(name);
      expect(runtime.has(name), `${name} missing from the built module`).toBe(true);
    }
  });
});
