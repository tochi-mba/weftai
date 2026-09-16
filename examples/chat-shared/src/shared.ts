import { pathToFileURL } from "node:url";
import { createSupplyChainRuntime } from "../../supply-chain/src/domain.js";

export function supplyChain() {
  return createSupplyChainRuntime();
}

export const queryTool = {
  name: "query_supply_chain",
  include: (op: { readonly effects: string }) => op.effects === "read",
};

export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** True when this file is the process entry (jiti/node), not when tests import it. */
export function isMain(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return pathToFileURL(entry).href === moduleUrl;
}
