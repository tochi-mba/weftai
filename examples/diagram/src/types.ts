import { z } from "weftai";

export const DiagramNode = z.object({
  id: z.string(),
  label: z.string(),
  entityType: z.string(),
  properties: z.record(z.string(), z.unknown()),
});
export type DiagramNode = z.infer<typeof DiagramNode>;

/** An edge as stored on disk: endpoints by id only. */
export const RawEdge = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  relationshipType: z.string(),
  /** For ownership edges the percentage lives here, as in the source application: `"75%"`. */
  label: z.string(),
});
export type RawEdge = z.infer<typeof RawEdge>;

/** An edge with endpoint labels denormalised so the model never sees an id. */
export const DiagramEdge = RawEdge.extend({
  fromLabel: z.string(),
  toLabel: z.string(),
});
export type DiagramEdge = z.infer<typeof DiagramEdge>;

export const DiagramFile = z.object({
  nodes: z.array(DiagramNode),
  edges: z.array(RawEdge),
});
export type DiagramFile = z.infer<typeof DiagramFile>;

export const Diagram = z.object({
  nodes: z.array(DiagramNode),
  edges: z.array(DiagramEdge),
});
export type Diagram = z.infer<typeof Diagram>;

export const DiagramPath = z.object({
  id: z.string(),
  label: z.string(),
  hops: z.number(),
  /** Effective ownership along the path, in percent; `undefined` when an edge is not ownership. */
  weightPercent: z.number().optional(),
  nodeLabels: z.array(z.string()),
  edgeTypes: z.array(z.string()),
});
export type DiagramPath = z.infer<typeof DiagramPath>;

export interface DiagramContext {
  readonly diagram: Diagram;
  selected: string[];
}

/** Resolve endpoint labels once so edges can be rendered without a context. */
export function enrich(file: DiagramFile): Diagram {
  const labels = new Map(file.nodes.map((node) => [node.id, node.label]));
  return {
    nodes: file.nodes,
    edges: file.edges.map((edge) => ({
      ...edge,
      fromLabel: labels.get(edge.from) ?? edge.from,
      toLabel: labels.get(edge.to) ?? edge.to,
    })),
  };
}
