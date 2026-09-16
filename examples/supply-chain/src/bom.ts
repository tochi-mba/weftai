import { parseQuantity } from "./fields.js";
import type { BomPath, Catalog, Link, Part } from "./types.js";

/** Route discovery can grow exponentially, so it is capped; every cap that bites emits a notice. */
export const MAX_PATH_DEPTH = 8;
export const MAX_PATHS_PER_PAIR = 20;
export const MAX_PAIRS = 50;

export function partById(catalog: Catalog, id: string): Part | undefined {
  return catalog.parts.find((part) => part.id === id);
}

function linksFrom(catalog: Catalog, id: string, linkType: string | undefined): Link[] {
  return catalog.links.filter(
    (link) => link.from === id && (linkType === undefined || link.relationshipType === linkType),
  );
}

function linksTo(catalog: Catalog, id: string, linkType: string | undefined): Link[] {
  return catalog.links.filter(
    (link) => link.to === id && (linkType === undefined || link.relationshipType === linkType),
  );
}

export function walkComponents(
  catalog: Catalog,
  seeds: readonly Part[],
  depth: number | "all",
  linkType: string,
): Part[] {
  return walk(catalog, seeds, depth, "down", linkType);
}

/** `ultimate` keeps only parents that are never themselves contained: the finished goods. */
export function walkUsedIn(
  catalog: Catalog,
  seeds: readonly Part[],
  depth: number | "all" | "ultimate",
  linkType: string,
): Part[] {
  if (depth === "ultimate") {
    const all = walk(catalog, seeds, "all", "up", linkType);
    return all.filter((part) => linksTo(catalog, part.id, linkType).length === 0);
  }
  return walk(catalog, seeds, depth, "up", linkType);
}

/** Breadth-first with a visited set, so simple traversal needs no cap. Order is hop order. */
function walk(
  catalog: Catalog,
  seeds: readonly Part[],
  depth: number | "all",
  direction: "up" | "down",
  linkType: string,
): Part[] {
  const max = depth === "all" ? Number.POSITIVE_INFINITY : depth;
  const seen = new Set<string>(seeds.map((part) => part.id));
  const out: Part[] = [];
  let frontier = [...seeds];
  let hop = 0;
  while (frontier.length > 0 && hop < max) {
    hop += 1;
    const next: Part[] = [];
    for (const part of frontier) {
      const links =
        direction === "down"
          ? linksFrom(catalog, part.id, linkType)
          : linksTo(catalog, part.id, linkType);
      for (const link of links) {
        const id = direction === "down" ? link.to : link.from;
        if (seen.has(id)) continue;
        seen.add(id);
        const found = partById(catalog, id);
        if (found !== undefined) {
          out.push(found);
          next.push(found);
        }
      }
    }
    frontier = next;
  }
  return out;
}

export interface PathSearch {
  readonly from: readonly Part[];
  readonly to: readonly Part[];
  /** Restrict to one link type; `undefined` spans every type ("how are X and Y related"). */
  readonly linkType: string | undefined;
  readonly notice: (message: string) => void;
}

export function findPaths(catalog: Catalog, search: PathSearch): BomPath[] {
  const pairs: [Part, Part][] = [];
  for (const from of search.from) {
    for (const to of search.to) {
      if (from.id !== to.id) pairs.push([from, to]);
    }
  }
  if (pairs.length > MAX_PAIRS) {
    search.notice(
      `Route search limited to the first ${MAX_PAIRS} of ${pairs.length} part pairs; other pairs were not searched.`,
    );
  }
  const paths: BomPath[] = [];
  for (const [from, to] of pairs.slice(0, MAX_PAIRS)) {
    paths.push(...pathsBetween(catalog, from, to, search.linkType, search.notice));
  }
  return paths;
}

interface Frame {
  readonly part: Part;
  readonly parts: readonly Part[];
  readonly links: readonly Link[];
}

/** Depth-first enumeration of simple routes, capped on depth and on routes per pair. */
function pathsBetween(
  catalog: Catalog,
  from: Part,
  to: Part,
  linkType: string | undefined,
  notice: (message: string) => void,
): BomPath[] {
  const found: BomPath[] = [];
  const stack: Frame[] = [{ part: from, parts: [from], links: [] }];
  let truncatedDepth = false;
  let truncatedCount = false;

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    if (current.part.id === to.id && current.links.length > 0) {
      found.push(toPath(current.parts, current.links));
      if (found.length >= MAX_PATHS_PER_PAIR) {
        truncatedCount = true;
        break;
      }
      continue;
    }
    if (current.links.length >= MAX_PATH_DEPTH) {
      truncatedDepth = true;
      continue;
    }
    for (const link of linksFrom(catalog, current.part.id, linkType)) {
      if (current.parts.some((hop) => hop.id === link.to)) continue;
      const next = partById(catalog, link.to);
      if (next === undefined) continue;
      stack.push({ part: next, parts: [...current.parts, next], links: [...current.links, link] });
    }
  }

  if (truncatedDepth) {
    notice(
      `Search stopped at ${MAX_PATH_DEPTH} hops between ${from.label} and ${to.label}; longer routes may exist.`,
    );
  }
  if (truncatedCount) {
    notice(
      `Returned the first ${MAX_PATHS_PER_PAIR} routes between ${from.label} and ${to.label}; more may exist.`,
    );
  }
  return found;
}

/** Summarise a route: quantity arithmetic when every hop is a Contains link. */
function toPath(parts: readonly Part[], links: readonly Link[]): BomPath {
  const first = parts[0]?.label ?? "?";
  const last = parts[parts.length - 1]?.label ?? "?";
  const hops = links.length;
  const linkTypes = links.map((link) => link.relationshipType);
  const containsOnly = linkTypes.every((type) => type === "Contains");
  const base = {
    id: parts.map((part) => part.id).join(">"),
    hops,
    partLabels: parts.map((part) => part.label),
    linkTypes,
  };
  if (containsOnly) {
    const units = links.reduce((acc, link) => acc * parseQuantity(link.label), 1);
    const quantity = Math.round(units * 10) / 10;
    const how = hops === 1 ? "directly" : "indirectly";
    return {
      ...base,
      quantity,
      label: `${first} ${how} needs ${quantity} × ${last} (${hops} hop${hops === 1 ? "" : "s"})`,
    };
  }
  if (hops === 1) {
    const type = (linkTypes[0] ?? "link").toLowerCase();
    return { ...base, label: `${first} has a direct ${type} link to ${last} (direct)` };
  }
  return {
    ...base,
    label: `${first} reaches ${last} via ${hops} hops (${linkTypes.join(", ")})`,
  };
}

/** Links where the part is parent or child: the one thing ANDed filters cannot express. */
export function involving(catalog: Catalog, parts: readonly Part[]): Link[] {
  const ids = new Set(parts.map((part) => part.id));
  return catalog.links.filter((link) => ids.has(link.from) || ids.has(link.to));
}
