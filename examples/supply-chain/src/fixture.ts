import { type Catalog, type CatalogFile, enrich } from "./types.js";

/**
 * A small bill of materials, ids included so tests can prove they never leak:
 *
 *   Aurora Starter Kit -1-> Aurora Drone -1-> Power Module -4-> Voltage Regulator
 *                           Aurora Drone -2-> Sensor Board
 *                           Aurora Drone -requires-> Reflow Fixture
 */
export const ids = {
  kit: "11111111-1111-1111-1111-111111111111",
  drone: "22222222-2222-2222-2222-222222222222",
  power: "33333333-3333-3333-3333-333333333333",
  sensor: "44444444-4444-4444-4444-444444444444",
  regulator: "55555555-5555-5555-5555-555555555555",
  fixture: "66666666-6666-6666-6666-666666666666",
  regulatorDuplicate: "99999999-9999-9999-9999-999999999999",
} as const;

export const fixtureFile: CatalogFile = {
  parts: [
    { id: ids.kit, label: "Aurora Starter Kit", partType: "Bundle" },
    { id: ids.drone, label: "Aurora Drone", partType: "Assembly", origin: "Germany" },
    { id: ids.power, label: "Power Module", partType: "Assembly", origin: "Malaysia" },
    { id: ids.sensor, label: "Sensor Board", partType: "Component", origin: "Taiwan" },
    { id: ids.regulator, label: "Voltage Regulator", partType: "Component", origin: "Taiwan" },
    { id: ids.fixture, label: "Reflow Fixture", partType: "Tooling" },
  ],
  links: [
    { id: "l1", from: ids.kit, to: ids.drone, relationshipType: "Contains", label: "1" },
    { id: "l2", from: ids.drone, to: ids.power, relationshipType: "Contains", label: "1" },
    { id: "l3", from: ids.power, to: ids.regulator, relationshipType: "Contains", label: "4" },
    { id: "l4", from: ids.drone, to: ids.sensor, relationshipType: "Contains", label: "2" },
    { id: "l5", from: ids.drone, to: ids.fixture, relationshipType: "Requires", label: "" },
  ],
};

export const fixture: Catalog = enrich(fixtureFile);

/** The fixture plus a second, origin-less "Voltage Regulator" for the disambiguation scenario. */
export function withDuplicateRegulator(): Catalog {
  return enrich({
    parts: [
      ...fixtureFile.parts,
      { id: ids.regulatorDuplicate, label: "Voltage Regulator", partType: "Component" },
    ],
    links: fixtureFile.links,
  });
}

/** The fixture with `count` extra components hanging off the drone. */
export function largeCatalog(count: number): Catalog {
  const parts = [...fixtureFile.parts];
  const links = [...fixtureFile.links];
  for (let i = 1; i <= count; i++) {
    const id = `extra-${String(i).padStart(3, "0")}`;
    parts.push({ id, label: `Component ${i}`, partType: "Component", origin: "Malaysia" });
    links.push({ id: `lx${i}`, from: ids.drone, to: id, relationshipType: "Contains", label: "1" });
  }
  return enrich({ parts, links });
}

/** A single Contains chain of `length` hops from "Stage 0" to "Stage N", for route-depth caps. */
export function chainCatalog(length: number): Catalog {
  const parts = Array.from({ length: length + 1 }, (_, i) => ({
    id: `stage-${i}`,
    label: `Stage ${i}`,
    partType: "Assembly",
  }));
  const links = Array.from({ length }, (_, i) => ({
    id: `sl${i}`,
    from: `stage-${i}`,
    to: `stage-${i + 1}`,
    relationshipType: "Contains",
    label: "1",
  }));
  return enrich({ parts, links });
}
