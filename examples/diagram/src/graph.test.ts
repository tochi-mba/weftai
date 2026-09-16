import { describe, expect, it } from "vitest";
import { chainDiagram, fixture, ids, largeDiagram } from "./fixture.js";
import {
  findPaths,
  involving,
  MAX_PAIRS,
  MAX_PATH_DEPTH,
  MAX_PATHS_PER_PAIR,
  nodeById,
  walkAncestors,
  walkDescendants,
} from "./graph.js";
import { enrich } from "./types.js";

function node(id: string) {
  const found = nodeById(fixture, id);
  if (found === undefined) throw new Error(`missing node ${id}`);
  return found;
}

const plain = (id: string, label = id) => ({
  id,
  label,
  entityType: "Corporate",
  properties: {},
});
const own = (from: string, to: string) => ({
  id: `${from}->${to}`,
  from,
  to,
  relationshipType: "Ownership",
  label: "100%",
});

describe("walkDescendants", () => {
  it("walks every ownership descendant of Corporate 1 in hop order", () => {
    const down = walkDescendants(fixture, [node(ids.corporate1)], "all", "Ownership");
    expect(down.map((n) => n.label)).toEqual(["Sub 1 Ltd", "Sub 2 Ltd", "Sub 3 Ltd"]);
  });

  it("does not follow cashflow edges unless asked", () => {
    const down = walkDescendants(fixture, [node(ids.corporate1)], "all", "Ownership");
    expect(down.map((n) => n.label)).not.toContain("Trust A");
    const cash = walkDescendants(fixture, [node(ids.corporate1)], "all", "Cashflow");
    expect(cash.map((n) => n.label)).toEqual(["Trust A"]);
  });

  it("respects a numeric depth", () => {
    const one = walkDescendants(fixture, [node(ids.corporate1)], 1, "Ownership");
    expect(one.map((n) => n.label)).toEqual(["Sub 1 Ltd", "Sub 2 Ltd"]);
    const two = walkDescendants(fixture, [node(ids.corporate1)], 2, "Ownership");
    expect(two.map((n) => n.label)).toEqual(["Sub 1 Ltd", "Sub 2 Ltd", "Sub 3 Ltd"]);
  });

  it("returns nothing for a leaf and never returns a seed, even one reachable from another seed", () => {
    expect(walkDescendants(fixture, [node(ids.sub3)], "all", "Ownership")).toEqual([]);
    const both = walkDescendants(
      fixture,
      [node(ids.corporate1), node(ids.sub1)],
      "all",
      "Ownership",
    );
    expect(both.map((n) => n.label)).toEqual(["Sub 2 Ltd", "Sub 3 Ltd"]);
  });

  it("returns nothing for no seeds", () => {
    expect(walkDescendants(fixture, [], "all", "Ownership")).toEqual([]);
  });

  it("ignores edges to nodes that do not exist", () => {
    const dangling = enrich({ nodes: [plain("a")], edges: [own("a", "ghost")] });
    const a = nodeById(dangling, "a");
    if (a === undefined) throw new Error("missing");
    expect(walkDescendants(dangling, [a], "all", "Ownership")).toEqual([]);
  });
});

describe("walkAncestors", () => {
  it("walks up to the ultimate owner", () => {
    const up = walkAncestors(fixture, [node(ids.sub3)], "all", "Ownership");
    expect(up.map((n) => n.label)).toEqual(["Sub 1 Ltd", "Corporate 1", "Jonah Smith"]);
  });

  it("keeps only owners that nothing owns at ultimate depth", () => {
    const roots = walkAncestors(fixture, [node(ids.sub3)], "ultimate", "Ownership");
    expect(roots.map((n) => n.label)).toEqual(["Jonah Smith"]);
  });

  it("walks a single hop", () => {
    expect(walkAncestors(fixture, [node(ids.sub3)], 1, "Ownership").map((n) => n.label)).toEqual([
      "Sub 1 Ltd",
    ]);
  });

  it("returns nothing above the ultimate owner", () => {
    expect(walkAncestors(fixture, [node(ids.jonah)], "all", "Ownership")).toEqual([]);
    expect(walkAncestors(fixture, [node(ids.jonah)], "ultimate", "Ownership")).toEqual([]);
  });

  it("survives cycles and treats a cycle as having no ultimate owner", () => {
    const cyclic = enrich({
      nodes: [plain("a", "A"), plain("b", "B")],
      edges: [own("a", "b"), own("b", "a")],
    });
    const a = nodeById(cyclic, "a");
    if (a === undefined) throw new Error("missing");
    expect(walkAncestors(cyclic, [a], "all", "Ownership").map((n) => n.label)).toEqual(["B"]);
    expect(walkAncestors(cyclic, [a], "ultimate", "Ownership")).toEqual([]);
    expect(walkDescendants(cyclic, [a], "all", "Ownership").map((n) => n.label)).toEqual(["B"]);
  });

  it("finds two ultimate owners through a diamond", () => {
    const diamond = enrich({
      nodes: [plain("x", "X"), plain("y", "Y"), plain("m", "M"), plain("t", "T")],
      edges: [own("x", "m"), own("y", "m"), own("m", "t")],
    });
    const t = nodeById(diamond, "t");
    if (t === undefined) throw new Error("missing");
    expect(walkAncestors(diamond, [t], "ultimate", "Ownership").map((n) => n.label)).toEqual([
      "X",
      "Y",
    ]);
  });
});

describe("findPaths", () => {
  const quiet = () => undefined;

  it("multiplies ownership along Corporate 1 → Sub 1 Ltd → Sub 3 Ltd", () => {
    const notices: string[] = [];
    const paths = findPaths(fixture, {
      from: [node(ids.corporate1)],
      to: [node(ids.sub3)],
      edgeType: "Ownership",
      notice: (m) => notices.push(m),
    });
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatchObject({
      hops: 2,
      weightPercent: 50,
      label: "Corporate 1 indirectly owns 50% of Sub 3 Ltd (2 hops)",
      nodeLabels: ["Corporate 1", "Sub 1 Ltd", "Sub 3 Ltd"],
      edgeTypes: ["Ownership", "Ownership"],
    });
    expect(notices).toEqual([]);
  });

  it("describes a direct ownership hop", () => {
    const paths = findPaths(fixture, {
      from: [node(ids.jonah)],
      to: [node(ids.corporate1)],
      edgeType: undefined,
      notice: quiet,
    });
    expect(paths[0]?.label).toBe("Jonah Smith directly owns 92% of Corporate 1 (1 hop)");
    expect(paths[0]?.weightPercent).toBe(92);
  });

  it("rounds effective ownership to one decimal place", () => {
    const paths = findPaths(fixture, {
      from: [node(ids.jonah)],
      to: [node(ids.sub3)],
      edgeType: "Ownership",
      notice: quiet,
    });
    expect(paths[0]?.weightPercent).toBe(46);
    expect(paths[0]?.label).toBe("Jonah Smith indirectly owns 46% of Sub 3 Ltd (3 hops)");
    const sub2 = findPaths(fixture, {
      from: [node(ids.jonah)],
      to: [node(ids.sub2)],
      edgeType: "Ownership",
      notice: quiet,
    });
    expect(sub2[0]?.weightPercent).toBe(69);
  });

  it("describes a non-ownership relationship without ownership arithmetic", () => {
    const paths = findPaths(fixture, {
      from: [node(ids.corporate1)],
      to: [node(ids.trustA)],
      edgeType: undefined,
      notice: quiet,
    });
    expect(paths).toHaveLength(1);
    expect(paths[0]?.label).toBe("Corporate 1 has a direct cashflow to Trust A (direct)");
    expect(paths[0]?.weightPercent).toBeUndefined();
  });

  it("describes a mixed multi-hop route", () => {
    const paths = findPaths(fixture, {
      from: [node(ids.jonah)],
      to: [node(ids.trustA)],
      edgeType: undefined,
      notice: quiet,
    });
    expect(paths[0]?.label).toBe("Jonah Smith reaches Trust A via 2 hops (Ownership, Cashflow)");
  });

  it("finds nothing when the edge type excludes the only route", () => {
    const paths = findPaths(fixture, {
      from: [node(ids.corporate1)],
      to: [node(ids.trustA)],
      edgeType: "Ownership",
      notice: quiet,
    });
    expect(paths).toEqual([]);
  });

  it("skips pairs of a node with itself and empty sets", () => {
    expect(
      findPaths(fixture, {
        from: [node(ids.sub3)],
        to: [node(ids.sub3)],
        edgeType: undefined,
        notice: quiet,
      }),
    ).toEqual([]);
    expect(
      findPaths(fixture, { from: [], to: fixture.nodes, edgeType: undefined, notice: quiet }),
    ).toEqual([]);
  });

  it("returns every simple route between two nodes", () => {
    const two = enrich({
      nodes: [plain("s"), plain("a"), plain("b"), plain("t")],
      edges: [own("s", "a"), own("s", "b"), own("a", "t"), own("b", "t")],
    });
    const s = nodeById(two, "s");
    const t = nodeById(two, "t");
    if (s === undefined || t === undefined) throw new Error("missing");
    const paths = findPaths(two, { from: [s], to: [t], edgeType: undefined, notice: quiet });
    expect(paths.map((p) => p.nodeLabels.join(">")).sort()).toEqual(["s>a>t", "s>b>t"]);
  });

  it("emits a pair-cap notice above MAX_PAIRS and searches only the first pairs", () => {
    const big = largeDiagram(10);
    const notices: string[] = [];
    findPaths(big, {
      from: big.nodes,
      to: big.nodes,
      edgeType: undefined,
      notice: (m) => notices.push(m),
    });
    const pairs = big.nodes.length * (big.nodes.length - 1);
    expect(pairs).toBeGreaterThan(MAX_PAIRS);
    expect(notices).toContainEqual(
      `Path search limited to the first ${MAX_PAIRS} of ${pairs} node pairs; other pairs were not searched.`,
    );
  });

  it("does not emit a pair-cap notice at exactly MAX_PAIRS", () => {
    const nodes = Array.from({ length: 8 }, (_, i) => plain(`n${i}`));
    const flat = enrich({ nodes, edges: [] });
    const notices: string[] = [];
    findPaths(flat, {
      from: flat.nodes.slice(0, 5),
      to: flat.nodes.slice(5, 8).concat(flat.nodes.slice(0, 5)),
      edgeType: undefined,
      notice: (m) => notices.push(m),
    });
    expect(notices).toEqual([]);
  });

  it("stops at MAX_PATH_DEPTH hops and says longer routes may exist", () => {
    const chain = chainDiagram(MAX_PATH_DEPTH + 2);
    const first = chain.nodes[0];
    const last = chain.nodes[chain.nodes.length - 1];
    if (first === undefined || last === undefined) throw new Error("missing");
    const notices: string[] = [];
    const paths = findPaths(chain, {
      from: [first],
      to: [last],
      edgeType: undefined,
      notice: (m) => notices.push(m),
    });
    expect(paths).toEqual([]);
    expect(notices).toEqual([
      `Search stopped at ${MAX_PATH_DEPTH} hops between Chain 0 and Chain ${MAX_PATH_DEPTH + 2}; longer routes may exist.`,
    ]);
  });

  it("finds a route exactly at the depth limit without a notice", () => {
    const chain = chainDiagram(MAX_PATH_DEPTH);
    const first = chain.nodes[0];
    const last = chain.nodes[chain.nodes.length - 1];
    if (first === undefined || last === undefined) throw new Error("missing");
    const notices: string[] = [];
    const paths = findPaths(chain, {
      from: [first],
      to: [last],
      edgeType: undefined,
      notice: (m) => notices.push(m),
    });
    expect(paths).toHaveLength(1);
    expect(paths[0]?.hops).toBe(MAX_PATH_DEPTH);
    expect(notices).toEqual([]);
  });

  it("caps the number of paths per pair with a notice", () => {
    // Each layer has three parallel nodes then a join; 4 layers are 8 hops (within the depth cap)
    // and 3^4 = 81 distinct routes.
    const nodes = [plain("s")];
    const edges: ReturnType<typeof own>[] = [];
    let previous = "s";
    for (let layer = 0; layer < 4; layer++) {
      const join = `j${layer}`;
      nodes.push(plain(join));
      for (const branch of ["a", "b", "c"]) {
        const id = `${branch}${layer}`;
        nodes.push(plain(id));
        edges.push(own(previous, id), own(id, join));
      }
      previous = join;
    }
    const lattice = enrich({ nodes, edges });
    const s = nodeById(lattice, "s");
    const end = nodeById(lattice, "j3");
    if (s === undefined || end === undefined) throw new Error("missing");
    const notices: string[] = [];
    const paths = findPaths(lattice, {
      from: [s],
      to: [end],
      edgeType: undefined,
      notice: (m) => notices.push(m),
    });
    expect(paths).toHaveLength(MAX_PATHS_PER_PAIR);
    expect(notices).toEqual([
      `Returned the first ${MAX_PATHS_PER_PAIR} paths between s and j3; more may exist.`,
    ]);
  });
});

describe("involving", () => {
  it("matches edges where the node is source or target", () => {
    const edges = involving(fixture, [node(ids.sub1)]);
    expect(edges.map((e) => e.id)).toEqual(["e2", "e3"]);
  });

  it("returns each edge once for several nodes", () => {
    const edges = involving(fixture, [node(ids.sub1), node(ids.corporate1)]);
    expect(edges.map((e) => e.id)).toEqual(["e1", "e2", "e3", "e4", "e5"]);
  });

  it("returns nothing for an isolated node or no nodes", () => {
    const lonely = enrich({ nodes: [plain("x", "X")], edges: [] });
    const x = nodeById(lonely, "x");
    if (x === undefined) throw new Error("missing");
    expect(involving(lonely, [x])).toEqual([]);
    expect(involving(fixture, [])).toEqual([]);
  });
});

describe("nodeById", () => {
  it("finds by id and returns undefined otherwise", () => {
    expect(nodeById(fixture, ids.trustA)?.label).toBe("Trust A");
    expect(nodeById(fixture, "nope")).toBeUndefined();
  });
});
