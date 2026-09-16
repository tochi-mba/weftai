import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRegistry, createRuntime, type Registry, z } from "agentweft";
import { fixture, NOW } from "./fixture.js";
import { documentOperations } from "./operations.js";
import { Contract, type DocumentsContext } from "./types.js";

const FixtureFile = z.object({
  now: z.string().default(NOW),
  contracts: z.array(Contract),
});

export function createContext(
  contracts: readonly Contract[] = fixture,
  now: string = NOW,
): DocumentsContext {
  return { contracts, now };
}

export function loadContext(fixturePath?: string): DocumentsContext {
  if (fixturePath === undefined) return createContext();
  const raw: unknown = JSON.parse(readFileSync(resolve(fixturePath), "utf8"));
  const parsed = FixtureFile.parse(raw);
  return createContext(parsed.contracts, parsed.now);
}

export const registry: Registry<DocumentsContext> = createRegistry({
  operations: documentOperations(),
});

export function createDocumentsRuntime(
  contracts: readonly Contract[] = fixture,
  now: string = NOW,
) {
  return {
    runtime: createRuntime({ registry }),
    ctx: createContext(contracts, now),
  };
}

const domain = {
  registry,
  createContext: loadContext,
};

export default domain;
