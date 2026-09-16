import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function writeScaffold(dir: string): readonly string[] {
  mkdirSync(join(dir, "src"), { recursive: true });
  const files: [string, string][] = [
    ["package.json", PACKAGE_JSON],
    ["tsconfig.json", TSCONFIG],
    ["src/types.ts", TYPES],
    ["src/fixture.json", FIXTURE],
    ["src/operations.ts", OPERATIONS],
    ["src/domain.ts", DOMAIN],
    ["src/domain.test.ts", TEST],
  ];
  const written: string[] = [];
  for (const [relative, contents] of files) {
    const path = join(dir, relative);
    writeFileSync(path, contents);
    written.push(path);
  }
  return written;
}

const PACKAGE_JSON = `{
  "name": "agentweft-domain",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "agentweft": "latest"
  }
}
`;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src"]
}
`;

const TYPES = `import { z } from "agentweft";

export const Item = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.string(),
});
export type Item = z.infer<typeof Item>;

export interface DomainContext {
  readonly items: readonly Item[];
}
`;

const FIXTURE = `{
  "items": [
    { "id": "1", "label": "Alpha", "kind": "demo" },
    { "id": "2", "label": "Beta", "kind": "demo" }
  ]
}
`;

const OPERATIONS = `import {
  collection,
  defineOperationFor,
  standardOperations,
  z,
} from "agentweft";
import { Item, type DomainContext } from "./types.js";

export const Items = collection("items", Item, {
  label: (item) => item.label,
  key: (item) => item.id,
  fields: () => [
    { name: "label", aliases: ["name"], get: (item) => item.label },
    { name: "kind", get: (item) => item.kind },
  ],
});

const define = defineOperationFor<DomainContext>();

export const find = define({
  name: "items.find",
  description: "Find items. Start here when you need a named set.",
  input: z.object({}),
  output: Items,
  run: ({ ctx }) => ctx.items,
});

export function domainOperations() {
  return [find, ...standardOperations(Items)];
}
`;

const DOMAIN = `import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRegistry, z } from "agentweft";
import { domainOperations } from "./operations.js";
import { Item, type DomainContext } from "./types.js";

const File = z.object({ items: z.array(Item) });

export const registry = createRegistry({ operations: domainOperations() });

export function createContext(fixturePath?: string): DomainContext {
  const path =
    fixturePath === undefined
      ? fileURLToPath(new URL("./fixture.json", import.meta.url))
      : resolve(fixturePath);
  const parsed = File.parse(JSON.parse(readFileSync(path, "utf8")));
  return { items: parsed.items };
}

export default { registry, createContext };
`;

const TEST = `import { createRuntime } from "agentweft";
import { describe, expect, it } from "vitest";
import { createContext, registry } from "./domain.js";

describe("domain", () => {
  it("finds the fixture items", async () => {
    const runtime = createRuntime({ registry });
    const result = await runtime.execute(
      { steps: [{ id: "all", op: "items.find" }] },
      { ctx: createContext() },
    );
    expect(result.ok).toBe(true);
    expect(result.steps[0]?.count).toBe(2);
    expect(result.text).toContain("all (items): 2 matched");
    expect(result.text).toContain("1. Alpha");
  });
});
`;
