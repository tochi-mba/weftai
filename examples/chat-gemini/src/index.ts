/** Gemini generateContent, Interactions, and Vertex endpoint construction. */
import { googleEndpoint, googleTools } from "@weftai/providers/google";
import { diagram, isMain, queryTool, writeJson } from "../../chat-shared/src/shared.js";

export function bind() {
  const { runtime, ctx } = diagram();
  const generate = googleTools(runtime, { model: "gemini-2.5-flash", ctx, tools: [queryTool] });
  const interactions = googleTools(runtime, {
    api: "interactions",
    model: "gemini-2.5-flash",
    ctx,
    tools: [queryTool],
  });
  const vertex = googleTools(runtime, { vertex: true, ctx, tools: [queryTool] });
  const decl = generate[0]?.functionDeclarations[0];
  const ix = interactions[0];
  const vertexDecl = vertex[0]?.functionDeclarations[0];
  if (decl === undefined || ix === undefined || vertexDecl === undefined) {
    throw new Error("expected Gemini tools");
  }
  return {
    generateContent: { name: decl.name },
    interactions: { type: ix.type, name: ix.name },
    vertexType: vertexDecl.parameters.type,
    vertexEndpoint: googleEndpoint(
      { kind: "vertex", project: "my-project", location: "us-central1" },
      "gemini-2.5-flash",
    ),
  };
}

if (isMain(import.meta.url)) writeJson(bind());
