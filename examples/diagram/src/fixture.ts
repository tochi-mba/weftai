import { type Diagram, type DiagramFile, enrich } from "./types.js";

/**
 * The test diagram from the Jigsaw proposal, ids included so tests can prove they never leak:
 *
 *   Jonah Smith -92%-> Corporate 1 -100%-> Sub 1 Ltd -50%-> Sub 3 Ltd
 *                      Corporate 1 -75%->  Sub 2 Ltd
 *                      Corporate 1 -cashflow-> Trust A
 */
export const ids = {
  corporate1: "11111111-1111-1111-1111-111111111111",
  sub1: "22222222-2222-2222-2222-222222222222",
  sub2: "33333333-3333-3333-3333-333333333333",
  sub3: "44444444-4444-4444-4444-444444444444",
  jonah: "55555555-5555-5555-5555-555555555555",
  trustA: "66666666-6666-6666-6666-666666666666",
  sub3Duplicate: "99999999-9999-9999-9999-999999999999",
} as const;

export const fixtureFile: DiagramFile = {
  nodes: [
    {
      id: ids.corporate1,
      label: "Corporate 1",
      entityType: "Corporate",
      properties: { Jurisdiction: "Cayman Islands" },
    },
    {
      id: ids.sub1,
      label: "Sub 1 Ltd",
      entityType: "Corporate",
      properties: { Jurisdiction: "United Kingdom" },
    },
    {
      id: ids.sub2,
      label: "Sub 2 Ltd",
      entityType: "Corporate",
      properties: { Jurisdiction: "Delaware" },
    },
    {
      id: ids.sub3,
      label: "Sub 3 Ltd",
      entityType: "Corporate",
      properties: { Jurisdiction: "Delaware" },
    },
    { id: ids.trustA, label: "Trust A", entityType: "Trust", properties: {} },
    { id: ids.jonah, label: "Jonah Smith", entityType: "Individual", properties: {} },
  ],
  edges: [
    { id: "e1", from: ids.jonah, to: ids.corporate1, relationshipType: "Ownership", label: "92%" },
    { id: "e2", from: ids.corporate1, to: ids.sub1, relationshipType: "Ownership", label: "100%" },
    { id: "e3", from: ids.sub1, to: ids.sub3, relationshipType: "Ownership", label: "50%" },
    { id: "e4", from: ids.corporate1, to: ids.sub2, relationshipType: "Ownership", label: "75%" },
    { id: "e5", from: ids.corporate1, to: ids.trustA, relationshipType: "Cashflow", label: "" },
  ],
};

export const fixture: Diagram = enrich(fixtureFile);

/** The fixture plus a second, jurisdiction-less "Sub 3 Ltd" for the disambiguation scenario. */
export function withDuplicateSub3(): Diagram {
  return enrich({
    nodes: [
      ...fixtureFile.nodes,
      { id: ids.sub3Duplicate, label: "Sub 3 Ltd", entityType: "Corporate", properties: {} },
    ],
    edges: fixtureFile.edges,
  });
}

/** The fixture with `count` extra subsidiaries hanging off Corporate 1. */
export function largeDiagram(count: number): Diagram {
  const nodes = [...fixtureFile.nodes];
  const edges = [...fixtureFile.edges];
  for (let i = 1; i <= count; i++) {
    const id = `extra-${String(i).padStart(3, "0")}`;
    nodes.push({
      id,
      label: `Entity ${i}`,
      entityType: "Corporate",
      properties: { Jurisdiction: "United Kingdom" },
    });
    edges.push({
      id: `ex${i}`,
      from: ids.corporate1,
      to: id,
      relationshipType: "Ownership",
      label: "100%",
    });
  }
  return enrich({ nodes, edges });
}

/** A single ownership chain of `length` hops from "Chain 0" to "Chain N", for path-depth caps. */
export function chainDiagram(length: number): Diagram {
  const nodes = Array.from({ length: length + 1 }, (_, i) => ({
    id: `chain-${i}`,
    label: `Chain ${i}`,
    entityType: "Corporate",
    properties: {},
  }));
  const edges = Array.from({ length }, (_, i) => ({
    id: `ce${i}`,
    from: `chain-${i}`,
    to: `chain-${i + 1}`,
    relationshipType: "Ownership",
    label: "100%",
  }));
  return enrich({ nodes, edges });
}
