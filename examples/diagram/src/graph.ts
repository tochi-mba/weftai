import { parsePercent } from "./fields.js";
import type { Diagram, DiagramEdge, DiagramNode, DiagramPath } from "./types.js";

/** Path discovery can grow exponentially, so it is capped; every cap that bites emits a notice. */
export const MAX_PATH_DEPTH = 8;
export const MAX_PATHS_PER_PAIR = 20;
export const MAX_PAIRS = 50;

export function nodeById(diagram: Diagram, id: string): DiagramNode | undefined {
  return diagram.nodes.find((node) => node.id === id);
}

function edgesFrom(diagram: Diagram, id: string, edgeType: string | undefined): DiagramEdge[] {
  return diagram.edges.filter(
    (edge) => edge.from === id && (edgeType === undefined || edge.relationshipType === edgeType),
  );
}

function edgesTo(diagram: Diagram, id: string, edgeType: string | undefined): DiagramEdge[] {
  return diagram.edges.filter(
    (edge) => edge.to === id && (edgeType === undefined || edge.relationshipType === edgeType),
  );
}

export function walkDescendants(
  diagram: Diagram,
  seeds: readonly DiagramNode[],
  depth: number | "all",
  edgeType: string,
): DiagramNode[] {
  return walk(diagram, seeds, depth, "down", edgeType);
}

/** `ultimate` keeps only ancestors that are never themselves the target of an ownership edge. */
export function walkAncestors(
  diagram: Diagram,
  seeds: readonly DiagramNode[],
  depth: number | "all" | "ultimate",
  edgeType: string,
): DiagramNode[] {
  if (depth === "ultimate") {
    const all = walk(diagram, seeds, "all", "up", edgeType);
    return all.filter((node) => edgesTo(diagram, node.id, edgeType).length === 0);
  }
  return walk(diagram, seeds, depth, "up", edgeType);
}

/** Breadth-first with a visited set, so simple traversal needs no cap. Order is hop order. */
function walk(
  diagram: Diagram,
  seeds: readonly DiagramNode[],
  depth: number | "all",
  direction: "up" | "down",
  edgeType: string,
): DiagramNode[] {
  const max = depth === "all" ? Number.POSITIVE_INFINITY : depth;
  const seen = new Set<string>(seeds.map((node) => node.id));
  const out: DiagramNode[] = [];
  let frontier = [...seeds];
  let hop = 0;
  while (frontier.length > 0 && hop < max) {
    hop += 1;
    const next: DiagramNode[] = [];
    for (const node of frontier) {
      const edges =
        direction === "down"
          ? edgesFrom(diagram, node.id, edgeType)
          : edgesTo(diagram, node.id, edgeType);
      for (const edge of edges) {
        const id = direction === "down" ? edge.to : edge.from;
        if (seen.has(id)) continue;
        seen.add(id);
        const found = nodeById(diagram, id);
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
  readonly from: readonly DiagramNode[];
  readonly to: readonly DiagramNode[];
  /** Restrict to one edge type; `undefined` spans every type ("how are X and Y related"). */
  readonly edgeType: string | undefined;
  readonly notice: (message: string) => void;
}

export function findPaths(diagram: Diagram, search: PathSearch): DiagramPath[] {
  const pairs: [DiagramNode, DiagramNode][] = [];
  for (const from of search.from) {
    for (const to of search.to) {
      if (from.id !== to.id) pairs.push([from, to]);
    }
  }
  if (pairs.length > MAX_PAIRS) {
    search.notice(
      `Path search limited to the first ${MAX_PAIRS} of ${pairs.length} node pairs; other pairs were not searched.`,
    );
  }
  const paths: DiagramPath[] = [];
  for (const [from, to] of pairs.slice(0, MAX_PAIRS)) {
    paths.push(...pathsBetween(diagram, from, to, search.edgeType, search.notice));
  }
  return paths;
}

interface Frame {
  readonly node: DiagramNode;
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
}

/** Depth-first enumeration of simple paths, capped on depth and on paths per pair. */
function pathsBetween(
  diagram: Diagram,
  from: DiagramNode,
  to: DiagramNode,
  edgeType: string | undefined,
  notice: (message: string) => void,
): DiagramPath[] {
  const found: DiagramPath[] = [];
  const stack: Frame[] = [{ node: from, nodes: [from], edges: [] }];
  let truncatedDepth = false;
  let truncatedCount = false;

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    if (current.node.id === to.id && current.edges.length > 0) {
      found.push(toPath(current.nodes, current.edges));
      if (found.length >= MAX_PATHS_PER_PAIR) {
        truncatedCount = true;
        break;
      }
      continue;
    }
    if (current.edges.length >= MAX_PATH_DEPTH) {
      truncatedDepth = true;
      continue;
    }
    for (const edge of edgesFrom(diagram, current.node.id, edgeType)) {
      if (current.nodes.some((hop) => hop.id === edge.to)) continue;
      const next = nodeById(diagram, edge.to);
      if (next === undefined) continue;
      stack.push({ node: next, nodes: [...current.nodes, next], edges: [...current.edges, edge] });
    }
  }

  if (truncatedDepth) {
    notice(
      `Search stopped at ${MAX_PATH_DEPTH} hops between ${from.label} and ${to.label}; longer routes may exist.`,
    );
  }
  if (truncatedCount) {
    notice(
      `Returned the first ${MAX_PATHS_PER_PAIR} paths between ${from.label} and ${to.label}; more may exist.`,
    );
  }
  return found;
}

/** Summarise a route the way the proposal does: ownership arithmetic when every hop owns. */
function toPath(nodes: readonly DiagramNode[], edges: readonly DiagramEdge[]): DiagramPath {
  const first = nodes[0]?.label ?? "?";
  const last = nodes[nodes.length - 1]?.label ?? "?";
  const hops = edges.length;
  const edgeTypes = edges.map((edge) => edge.relationshipType);
  const ownershipOnly = edgeTypes.every((type) => type === "Ownership");
  const base = {
    id: nodes.map((node) => node.id).join(">"),
    hops,
    nodeLabels: nodes.map((node) => node.label),
    edgeTypes,
  };
  if (ownershipOnly) {
    const weight = edges.reduce((acc, edge) => acc * parsePercent(edge.label), 1);
    const percent = Math.round(weight * 1000) / 10;
    const how = hops === 1 ? "directly" : "indirectly";
    return {
      ...base,
      weightPercent: percent,
      label: `${first} ${how} owns ${percent}% of ${last} (${hops} hop${hops === 1 ? "" : "s"})`,
    };
  }
  if (hops === 1) {
    const type = (edgeTypes[0] ?? "link").toLowerCase();
    return { ...base, label: `${first} has a direct ${type} to ${last} (direct)` };
  }
  return {
    ...base,
    label: `${first} reaches ${last} via ${hops} hops (${edgeTypes.join(", ")})`,
  };
}

/** Edges where the node is source or target: the one thing ANDed filters cannot express. */
export function involving(diagram: Diagram, nodes: readonly DiagramNode[]): DiagramEdge[] {
  const ids = new Set(nodes.map((node) => node.id));
  return diagram.edges.filter((edge) => ids.has(edge.from) || ids.has(edge.to));
}
