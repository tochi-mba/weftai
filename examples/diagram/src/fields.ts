import type { FieldSpec } from "agentweft";
import type { DiagramEdge, DiagramNode } from "./types.js";

/**
 * Field catalogues. Everyday names map to where the value really lives: `percentage` reads the
 * ownership edge's label, `type` means `entityType` on nodes and `relationshipType` on edges.
 * An exact field name always wins over an alias.
 */
export function nodeFields(): FieldSpec<DiagramNode>[] {
  return [
    { name: "label", aliases: ["name"], get: (n) => n.label },
    { name: "entityType", aliases: ["type"], get: (n) => n.entityType },
    { name: "Jurisdiction", aliases: ["jurisdiction"], get: (n) => n.properties.Jurisdiction },
  ];
}

export function edgeFields(): FieldSpec<DiagramEdge>[] {
  return [
    { name: "label", get: (e) => e.label },
    { name: "relationshipType", aliases: ["type"], get: (e) => e.relationshipType },
    {
      name: "percentage",
      aliases: ["ownership", "ownershipPercentage", "share", "percent"],
      get: (e) => (e.relationshipType === "Ownership" ? e.label : undefined),
    },
    { name: "from", aliases: ["source"], get: (e) => e.fromLabel },
    { name: "to", aliases: ["target"], get: (e) => e.toLabel },
  ];
}

/** `"75%"` → `0.75`; anything unparseable counts as a full share so a chain is never zeroed. */
export function parsePercent(label: string): number {
  const n = Number.parseFloat(label.replace("%", "").trim());
  return Number.isFinite(n) ? n / 100 : 1;
}
