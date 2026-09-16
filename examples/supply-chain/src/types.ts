import { z } from "weftai";

export const Part = z.object({
  id: z.string(),
  label: z.string(),
  partType: z.string(),
  /** Country of origin as the ERP records it; absent for tooling and bundles. */
  origin: z.string().optional(),
});
export type Part = z.infer<typeof Part>;

/** A link as stored on disk: endpoints by id only. */
export const RawLink = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  relationshipType: z.string(),
  /** For Contains links the units per parent unit live here, as the ERP exports it: `"4"`. */
  label: z.string(),
});
export type RawLink = z.infer<typeof RawLink>;

/** A link with endpoint labels denormalised so links can be rendered without a context. */
export const Link = RawLink.extend({
  fromLabel: z.string(),
  toLabel: z.string(),
});
export type Link = z.infer<typeof Link>;

export const CatalogFile = z.object({
  parts: z.array(Part),
  links: z.array(RawLink),
});
export type CatalogFile = z.infer<typeof CatalogFile>;

export const Catalog = z.object({
  parts: z.array(Part),
  links: z.array(Link),
});
export type Catalog = z.infer<typeof Catalog>;

export const BomPath = z.object({
  id: z.string(),
  label: z.string(),
  hops: z.number(),
  /** Units of the last part needed per unit of the first; `undefined` when a hop is not Contains. */
  quantity: z.number().optional(),
  partLabels: z.array(z.string()),
  linkTypes: z.array(z.string()),
});
export type BomPath = z.infer<typeof BomPath>;

export interface SupplyChainContext {
  readonly catalog: Catalog;
  reserved: string[];
}

/** Resolve endpoint labels once so links can be rendered without a context. */
export function enrich(file: CatalogFile): Catalog {
  const labels = new Map(file.parts.map((part) => [part.id, part.label]));
  return {
    parts: file.parts,
    links: file.links.map((link) => ({
      ...link,
      fromLabel: labels.get(link.from) ?? link.from,
      toLabel: labels.get(link.to) ?? link.to,
    })),
  };
}
