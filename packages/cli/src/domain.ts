import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import type { Registry } from "weftai";

export interface DomainModule<Ctx = unknown> {
  readonly registry: Registry<Ctx>;
  createContext(fixturePath?: string): Ctx | Promise<Ctx>;
}

export async function loadDomain(file: string): Promise<DomainModule> {
  const url = pathToFileURL(resolve(file)).href;
  const jiti = createJiti(import.meta.url, { alias: sourceAliases() });
  const loaded: unknown = await jiti.import(url);
  const domain = unwrap(loaded);
  if (domain.registry === undefined || typeof domain.createContext !== "function") {
    throw new Error(`'${file}' must default-export { registry, createContext(fixturePath?) }.`);
  }
  return domain;
}

function sourceAliases(): Record<string, string> {
  const weftai = fileURLToPath(new URL("../../core/src/index.ts", import.meta.url));
  return existsSync(weftai) ? { weftai } : {};
}

function unwrap(loaded: unknown): DomainModule {
  if (typeof loaded !== "object" || loaded === null) {
    throw new Error("Domain module did not export an object.");
  }
  const record = loaded as Record<string, unknown>;
  const inner = record.default;
  if (typeof inner === "object" && inner !== null && "registry" in inner) {
    return inner as DomainModule;
  }
  return loaded as DomainModule;
}
