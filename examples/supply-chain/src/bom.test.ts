import { describe, expect, it } from "vitest";
import {
  findPaths,
  involving,
  MAX_PAIRS,
  MAX_PATH_DEPTH,
  MAX_PATHS_PER_PAIR,
  partById,
  walkComponents,
  walkUsedIn,
} from "./bom.js";
import { chainCatalog, fixture, ids, largeCatalog } from "./fixture.js";
import { enrich } from "./types.js";

function part(id: string) {
  const found = partById(fixture, id);
  if (found === undefined) throw new Error(`missing part ${id}`);
  return found;
}

const plain = (id: string, label = id) => ({ id, label, partType: "Assembly" });
const contains = (from: string, to: string) => ({
  id: `${from}->${to}`,
  from,
  to,
  relationshipType: "Contains",
  label: "1",
});

describe("walkComponents", () => {
  it("walks every component of the drone in hop order", () => {
    const down = walkComponents(fixture, [part(ids.drone)], "all", "Contains");
    expect(down.map((p) => p.label)).toEqual(["Power Module", "Sensor Board", "Voltage Regulator"]);
  });

  it("does not follow tooling links unless asked", () => {
    const down = walkComponents(fixture, [part(ids.drone)], "all", "Contains");
    expect(down.map((p) => p.label)).not.toContain("Reflow Fixture");
    const tooling = walkComponents(fixture, [part(ids.drone)], "all", "Requires");
    expect(tooling.map((p) => p.label)).toEqual(["Reflow Fixture"]);
  });

  it("respects a numeric depth", () => {
    const one = walkComponents(fixture, [part(ids.drone)], 1, "Contains");
    expect(one.map((p) => p.label)).toEqual(["Power Module", "Sensor Board"]);
    const two = walkComponents(fixture, [part(ids.drone)], 2, "Contains");
    expect(two.map((p) => p.label)).toEqual(["Power Module", "Sensor Board", "Voltage Regulator"]);
  });

  it("returns nothing for a leaf and never returns a seed, even one reachable from another seed", () => {
    expect(walkComponents(fixture, [part(ids.regulator)], "all", "Contains")).toEqual([]);
    const both = walkComponents(fixture, [part(ids.drone), part(ids.power)], "all", "Contains");
    expect(both.map((p) => p.label)).toEqual(["Sensor Board", "Voltage Regulator"]);
  });

  it("returns nothing for no seeds", () => {
    expect(walkComponents(fixture, [], "all", "Contains")).toEqual([]);
  });

  it("ignores links to parts that do not exist", () => {
    const dangling = enrich({ parts: [plain("a")], links: [contains("a", "ghost")] });
    const a = partById(dangling, "a");
    if (a === undefined) throw new Error("missing");
    expect(walkComponents(dangling, [a], "all", "Contains")).toEqual([]);
  });
});

describe("walkUsedIn", () => {
  it("walks up to the finished product", () => {
    const up = walkUsedIn(fixture, [part(ids.regulator)], "all", "Contains");
    expect(up.map((p) => p.label)).toEqual(["Power Module", "Aurora Drone", "Aurora Starter Kit"]);
  });

  it("keeps only parts that nothing contains at ultimate depth", () => {
    const roots = walkUsedIn(fixture, [part(ids.regulator)], "ultimate", "Contains");
    expect(roots.map((p) => p.label)).toEqual(["Aurora Starter Kit"]);
  });

  it("walks a single hop", () => {
    expect(walkUsedIn(fixture, [part(ids.regulator)], 1, "Contains").map((p) => p.label)).toEqual([
      "Power Module",
    ]);
  });

  it("returns nothing above the finished product", () => {
    expect(walkUsedIn(fixture, [part(ids.kit)], "all", "Contains")).toEqual([]);
    expect(walkUsedIn(fixture, [part(ids.kit)], "ultimate", "Contains")).toEqual([]);
  });

  it("survives cycles and treats a cycle as having no finished product", () => {
    const cyclic = enrich({
      parts: [plain("a", "A"), plain("b", "B")],
      links: [contains("a", "b"), contains("b", "a")],
    });
    const a = partById(cyclic, "a");
    if (a === undefined) throw new Error("missing");
    expect(walkUsedIn(cyclic, [a], "all", "Contains").map((p) => p.label)).toEqual(["B"]);
    expect(walkUsedIn(cyclic, [a], "ultimate", "Contains")).toEqual([]);
    expect(walkComponents(cyclic, [a], "all", "Contains").map((p) => p.label)).toEqual(["B"]);
  });

  it("finds two finished products through a shared sub-assembly", () => {
    const diamond = enrich({
      parts: [plain("x", "X"), plain("y", "Y"), plain("m", "M"), plain("t", "T")],
      links: [contains("x", "m"), contains("y", "m"), contains("m", "t")],
    });
    const t = partById(diamond, "t");
    if (t === undefined) throw new Error("missing");
    expect(walkUsedIn(diamond, [t], "ultimate", "Contains").map((p) => p.label)).toEqual([
      "X",
      "Y",
    ]);
  });
});

describe("findPaths", () => {
  const quiet = () => undefined;

  it("multiplies quantities along Aurora Drone → Power Module → Voltage Regulator", () => {
    const notices: string[] = [];
    const paths = findPaths(fixture, {
      from: [part(ids.drone)],
      to: [part(ids.regulator)],
      linkType: "Contains",
      notice: (m) => notices.push(m),
    });
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatchObject({
      hops: 2,
      quantity: 4,
      label: "Aurora Drone indirectly needs 4 × Voltage Regulator (2 hops)",
      partLabels: ["Aurora Drone", "Power Module", "Voltage Regulator"],
      linkTypes: ["Contains", "Contains"],
    });
    expect(notices).toEqual([]);
  });

  it("describes a direct Contains hop", () => {
    const paths = findPaths(fixture, {
      from: [part(ids.kit)],
      to: [part(ids.drone)],
      linkType: undefined,
      notice: quiet,
    });
    expect(paths[0]?.label).toBe("Aurora Starter Kit directly needs 1 × Aurora Drone (1 hop)");
    expect(paths[0]?.quantity).toBe(1);
  });

  it("rounds fractional quantities to one decimal place", () => {
    const paths = findPaths(fixture, {
      from: [part(ids.kit)],
      to: [part(ids.regulator)],
      linkType: "Contains",
      notice: quiet,
    });
    expect(paths[0]?.quantity).toBe(4);
    expect(paths[0]?.label).toBe(
      "Aurora Starter Kit indirectly needs 4 × Voltage Regulator (3 hops)",
    );
    const sensors = findPaths(fixture, {
      from: [part(ids.kit)],
      to: [part(ids.sensor)],
      linkType: "Contains",
      notice: quiet,
    });
    expect(sensors[0]?.quantity).toBe(2);
    const fractional = enrich({
      parts: [plain("a", "A"), plain("b", "B"), plain("c", "C")],
      links: [
        { ...contains("a", "b"), label: "0.5" },
        { ...contains("b", "c"), label: "0.33" },
      ],
    });
    const a = partById(fractional, "a");
    const c = partById(fractional, "c");
    if (a === undefined || c === undefined) throw new Error("missing");
    const rounded = findPaths(fractional, {
      from: [a],
      to: [c],
      linkType: undefined,
      notice: quiet,
    });
    expect(rounded[0]?.quantity).toBe(0.2);
  });

  it("describes a tooling relationship without quantity arithmetic", () => {
    const paths = findPaths(fixture, {
      from: [part(ids.drone)],
      to: [part(ids.fixture)],
      linkType: undefined,
      notice: quiet,
    });
    expect(paths).toHaveLength(1);
    expect(paths[0]?.label).toBe(
      "Aurora Drone has a direct requires link to Reflow Fixture (direct)",
    );
    expect(paths[0]?.quantity).toBeUndefined();
  });

  it("describes a mixed multi-hop route", () => {
    const paths = findPaths(fixture, {
      from: [part(ids.kit)],
      to: [part(ids.fixture)],
      linkType: undefined,
      notice: quiet,
    });
    expect(paths[0]?.label).toBe(
      "Aurora Starter Kit reaches Reflow Fixture via 2 hops (Contains, Requires)",
    );
  });

  it("finds nothing when the link type excludes the only route", () => {
    const paths = findPaths(fixture, {
      from: [part(ids.drone)],
      to: [part(ids.fixture)],
      linkType: "Contains",
      notice: quiet,
    });
    expect(paths).toEqual([]);
  });

  it("skips pairs of a part with itself and empty sets", () => {
    expect(
      findPaths(fixture, {
        from: [part(ids.regulator)],
        to: [part(ids.regulator)],
        linkType: undefined,
        notice: quiet,
      }),
    ).toEqual([]);
    expect(
      findPaths(fixture, { from: [], to: fixture.parts, linkType: undefined, notice: quiet }),
    ).toEqual([]);
  });

  it("returns every simple route between two parts", () => {
    const two = enrich({
      parts: [plain("s"), plain("a"), plain("b"), plain("t")],
      links: [contains("s", "a"), contains("s", "b"), contains("a", "t"), contains("b", "t")],
    });
    const s = partById(two, "s");
    const t = partById(two, "t");
    if (s === undefined || t === undefined) throw new Error("missing");
    const paths = findPaths(two, { from: [s], to: [t], linkType: undefined, notice: quiet });
    expect(paths.map((p) => p.partLabels.join(">")).sort()).toEqual(["s>a>t", "s>b>t"]);
  });

  it("emits a pair-cap notice above MAX_PAIRS and searches only the first pairs", () => {
    const big = largeCatalog(10);
    const notices: string[] = [];
    findPaths(big, {
      from: big.parts,
      to: big.parts,
      linkType: undefined,
      notice: (m) => notices.push(m),
    });
    const pairs = big.parts.length * (big.parts.length - 1);
    expect(pairs).toBeGreaterThan(MAX_PAIRS);
    expect(notices).toContainEqual(
      `Route search limited to the first ${MAX_PAIRS} of ${pairs} part pairs; other pairs were not searched.`,
    );
  });

  it("does not emit a pair-cap notice at exactly MAX_PAIRS", () => {
    const parts = Array.from({ length: 8 }, (_, i) => plain(`n${i}`));
    const flat = enrich({ parts, links: [] });
    const notices: string[] = [];
    findPaths(flat, {
      from: flat.parts.slice(0, 5),
      to: flat.parts.slice(5, 8).concat(flat.parts.slice(0, 5)),
      linkType: undefined,
      notice: (m) => notices.push(m),
    });
    expect(notices).toEqual([]);
  });

  it("stops at MAX_PATH_DEPTH hops and says longer routes may exist", () => {
    const chain = chainCatalog(MAX_PATH_DEPTH + 2);
    const first = chain.parts[0];
    const last = chain.parts[chain.parts.length - 1];
    if (first === undefined || last === undefined) throw new Error("missing");
    const notices: string[] = [];
    const paths = findPaths(chain, {
      from: [first],
      to: [last],
      linkType: undefined,
      notice: (m) => notices.push(m),
    });
    expect(paths).toEqual([]);
    expect(notices).toEqual([
      `Search stopped at ${MAX_PATH_DEPTH} hops between Stage 0 and Stage ${MAX_PATH_DEPTH + 2}; longer routes may exist.`,
    ]);
  });

  it("finds a route exactly at the depth limit without a notice", () => {
    const chain = chainCatalog(MAX_PATH_DEPTH);
    const first = chain.parts[0];
    const last = chain.parts[chain.parts.length - 1];
    if (first === undefined || last === undefined) throw new Error("missing");
    const notices: string[] = [];
    const paths = findPaths(chain, {
      from: [first],
      to: [last],
      linkType: undefined,
      notice: (m) => notices.push(m),
    });
    expect(paths).toHaveLength(1);
    expect(paths[0]?.hops).toBe(MAX_PATH_DEPTH);
    expect(notices).toEqual([]);
  });

  it("caps the number of routes per pair with a notice", () => {
    // Each layer has three parallel parts then a join; 4 layers are 8 hops (within the depth cap)
    // and 3^4 = 81 distinct routes.
    const parts = [plain("s")];
    const links: ReturnType<typeof contains>[] = [];
    let previous = "s";
    for (let layer = 0; layer < 4; layer++) {
      const join = `j${layer}`;
      parts.push(plain(join));
      for (const branch of ["a", "b", "c"]) {
        const id = `${branch}${layer}`;
        parts.push(plain(id));
        links.push(contains(previous, id), contains(id, join));
      }
      previous = join;
    }
    const lattice = enrich({ parts, links });
    const s = partById(lattice, "s");
    const end = partById(lattice, "j3");
    if (s === undefined || end === undefined) throw new Error("missing");
    const notices: string[] = [];
    const paths = findPaths(lattice, {
      from: [s],
      to: [end],
      linkType: undefined,
      notice: (m) => notices.push(m),
    });
    expect(paths).toHaveLength(MAX_PATHS_PER_PAIR);
    expect(notices).toEqual([
      `Returned the first ${MAX_PATHS_PER_PAIR} routes between s and j3; more may exist.`,
    ]);
  });
});

describe("involving", () => {
  it("matches links where the part is parent or child", () => {
    const links = involving(fixture, [part(ids.power)]);
    expect(links.map((l) => l.id)).toEqual(["l2", "l3"]);
  });

  it("returns each link once for several parts", () => {
    const links = involving(fixture, [part(ids.power), part(ids.drone)]);
    expect(links.map((l) => l.id)).toEqual(["l1", "l2", "l3", "l4", "l5"]);
  });

  it("returns nothing for an isolated part or no parts", () => {
    const lonely = enrich({ parts: [plain("x", "X")], links: [] });
    const x = partById(lonely, "x");
    if (x === undefined) throw new Error("missing");
    expect(involving(lonely, [x])).toEqual([]);
    expect(involving(fixture, [])).toEqual([]);
  });
});

describe("partById", () => {
  it("finds by id and returns undefined otherwise", () => {
    expect(partById(fixture, ids.fixture)?.label).toBe("Reflow Fixture");
    expect(partById(fixture, "nope")).toBeUndefined();
  });
});
