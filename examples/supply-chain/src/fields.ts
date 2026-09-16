import type { FieldSpec } from "weftai";
import type { Link, Part } from "./types.js";

/**
 * Field catalogues. Everyday names map to where the value really lives: `quantity` reads the
 * Contains link's label, `type` means `partType` on parts and `relationshipType` on links, and
 * `country` is the part's `origin`. An exact field name always wins over an alias.
 */
export function partFields(): FieldSpec<Part>[] {
  return [
    { name: "label", aliases: ["name"], get: (p) => p.label },
    { name: "partType", aliases: ["type"], get: (p) => p.partType },
    { name: "origin", aliases: ["country"], get: (p) => p.origin },
  ];
}

export function linkFields(): FieldSpec<Link>[] {
  return [
    { name: "label", get: (l) => l.label },
    { name: "relationshipType", aliases: ["type"], get: (l) => l.relationshipType },
    {
      name: "quantity",
      aliases: ["qty", "units", "perUnit"],
      get: (l) => (l.relationshipType === "Contains" ? l.label : undefined),
    },
    { name: "from", aliases: ["parent", "source"], get: (l) => l.fromLabel },
    { name: "to", aliases: ["child", "target"], get: (l) => l.toLabel },
  ];
}

/** `"4"` → `4`; anything unparseable counts as one unit so a chain is never zeroed. */
export function parseQuantity(label: string): number {
  const n = Number.parseFloat(label.trim());
  return Number.isFinite(n) ? n : 1;
}
