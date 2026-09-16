import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRegistry, createRuntime, type Registry, type RuntimeOptions } from "agentweft";
import { fixture } from "./fixture.js";
import { diagramOperations } from "./operations.js";
import { type Diagram, type DiagramContext, DiagramFile, enrich } from "./types.js";

export function createContext(diagram: Diagram = fixture): DiagramContext {
  return { diagram, selected: [] };
}

/** CLI entry: load a diagram file (endpoint ids only) and enrich it with endpoint labels. */
export function loadContext(fixturePath?: string): DiagramContext {
  if (fixturePath === undefined) return createContext();
  const raw: unknown = JSON.parse(readFileSync(resolve(fixturePath), "utf8"));
  return createContext(enrich(DiagramFile.parse(raw)));
}

export const registry: Registry<DiagramContext> = createRegistry({
  operations: diagramOperations(),
});

export function createDiagramRuntime(
  diagram: Diagram = fixture,
  options: Omit<RuntimeOptions<DiagramContext>, "registry"> = {},
) {
  return {
    runtime: createRuntime({ registry, ...options }),
    ctx: createContext(diagram),
  };
}

const domain = {
  registry,
  createContext: loadContext,
};

export default domain;
