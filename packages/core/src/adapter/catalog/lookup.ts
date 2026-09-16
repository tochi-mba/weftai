import { closest } from "../../util/levenshtein.js";
import type { Capability, FamilyId, Region } from "../types.js";
import { CHINESE_CAPABILITIES } from "./chinese.js";
import { LOCAL_CAPABILITIES } from "./local.js";
import { WESTERN_CAPABILITIES } from "./western.js";

export const CAPABILITIES: readonly Capability[] = [
  ...WESTERN_CAPABILITIES,
  ...CHINESE_CAPABILITIES,
  ...LOCAL_CAPABILITIES,
];

export interface LookupOptions {
  readonly api?: FamilyId | undefined;
  readonly provider?: string | undefined;
  readonly region?: Region | undefined;
  readonly stream?: boolean | undefined;
}

export type LookupResult =
  | { readonly ok: true; readonly capability: Capability; readonly baseURL: string | undefined }
  | { readonly ok: false; readonly message: string };

/** Resolve the capability row for a model. Never guesses Chat Completions for an unknown name. */
export function lookupCapability(model: string, options: LookupOptions = {}): LookupResult {
  const matches = CAPABILITIES.filter((row) => {
    if (options.provider !== undefined && row.provider !== options.provider) return false;
    if (row.modelPattern === "." && options.provider === undefined) return false;
    return new RegExp(row.modelPattern).test(model);
  });
  if (matches.length === 0) {
    return { ok: false, message: unknownModelMessage(model) };
  }
  const byApi =
    options.api === undefined ? matches : matches.filter((row) => row.api === options.api);
  if (byApi.length === 0) {
    const apis = [...new Set(matches.map((row) => row.api))];
    return {
      ok: false,
      message: `Model '${model}' does not speak ${options.api}. It is catalogued for ${apis.join(", ")}. Pass one of those as api, or pick a different model.`,
    };
  }
  const selected = byApi.reduce(
    (best, row) => (score(row, model) > score(best, model) ? row : best),
    byApi[0] as Capability,
  );
  if (selected.tools === "no") {
    const alternative = matches.find((row) => row.tools === "yes");
    const hint =
      alternative === undefined
        ? selected.notes
        : `${selected.notes} A working row is ${alternative.provider} ${alternative.api}.`;
    return {
      ok: false,
      message: `Model '${model}' has no tool calling on ${selected.api}. ${hint}`,
    };
  }
  if (selected.tools === "unknown") {
    return {
      ok: false,
      message: `Model '${model}' is catalogued but tool calling is not confirmed. ${selected.notes}`,
    };
  }
  if (selected.tools === "json-mode-only") {
    return {
      ok: false,
      message: `Model '${model}' has JSON mode but not tool calling. ${selected.notes}`,
    };
  }
  if (options.stream === true && selected.streamTools === false) {
    return {
      ok: false,
      message: `Model '${model}' rejects tools with stream: true. Set streamTools: false. ${selected.notes}`,
    };
  }
  if (
    selected.modelIdKind === "endpoint" &&
    options.provider === "ark" &&
    !model.startsWith("ep-")
  ) {
    return {
      ok: false,
      message: `Doubao Ark expects an endpoint id (ep-…), not '${model}'. ${selected.notes}`,
    };
  }
  const baseURL = pickBaseURL(selected, options.region);
  return { ok: true, capability: selected, baseURL };
}

/** Throw a model-facing catalog error. Family helpers use this so a missing row never binds silently. */
export function requireCapability(model: string, options: LookupOptions = {}): Capability {
  const looked = lookupCapability(model, options);
  if (!looked.ok) throw new Error(looked.message);
  return looked.capability;
}

function score(row: Capability, model: string): number {
  let value = row.modelPattern.length;
  if (row.tools === "yes") value += 1000;
  if (row.tools === "unknown") value += 100;
  if (new RegExp(row.modelPattern).test(model) && row.modelPattern !== ".") value += 50;
  return value;
}

function pickBaseURL(row: Capability, region: Region | undefined): string | undefined {
  if (region === "intl" && row.baseURLIntl !== undefined) return row.baseURLIntl;
  return row.baseURL;
}

function unknownModelMessage(model: string): string {
  const names = [...new Set(CAPABILITIES.map((row) => row.provider))];
  const suggestion = closest(model, [
    ...CAPABILITIES.flatMap((row) => exampleNames(row)),
    ...names,
  ]);
  const families = [...new Set(CAPABILITIES.map((row) => row.api))].join(", ");
  const did = suggestion === undefined ? "" : ` Did you mean '${suggestion}'?`;
  return `Unknown model '${model}'.${did} Pass api to override the catalog for a new model. Known families: ${families}.`;
}

function exampleNames(row: Capability): readonly string[] {
  const source = row.modelPattern.replace(/^\^/, "").replace(/\$$/, "");
  if (source === "." || source.includes("(") || source.includes("|")) return [];
  return [source.replace(/\\/g, "")];
}

export function capabilitiesFor(provider: string): readonly Capability[] {
  return CAPABILITIES.filter((row) => row.provider === provider);
}
