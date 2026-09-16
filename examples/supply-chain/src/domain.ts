import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRegistry, createRuntime, type Registry, type RuntimeOptions } from "weftai";
import { fixture } from "./fixture.js";
import { supplyChainOperations } from "./operations.js";
import { type Catalog, CatalogFile, enrich, type SupplyChainContext } from "./types.js";

export function createContext(catalog: Catalog = fixture): SupplyChainContext {
  return { catalog, reserved: [] };
}

/** CLI entry: load a catalog file (endpoint ids only) and enrich it with endpoint labels. */
export function loadContext(fixturePath?: string): SupplyChainContext {
  if (fixturePath === undefined) return createContext();
  const raw: unknown = JSON.parse(readFileSync(resolve(fixturePath), "utf8"));
  return createContext(enrich(CatalogFile.parse(raw)));
}

export const registry: Registry<SupplyChainContext> = createRegistry({
  operations: supplyChainOperations(),
});

export function createSupplyChainRuntime(
  catalog: Catalog = fixture,
  options: Omit<RuntimeOptions<SupplyChainContext>, "registry"> = {},
) {
  return {
    runtime: createRuntime({ registry, ...options }),
    ctx: createContext(catalog),
  };
}

const domain = {
  registry,
  createContext: loadContext,
};

export default domain;
