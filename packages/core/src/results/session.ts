import type { SessionView } from "../plan/validate.js";
import type { ResultStore } from "./types.js";

/** Adapts a result store to the read-only view `validatePlan` uses for earlier-call references. */
export function sessionView(store: ResultStore, sessionId: string): SessionView {
  return {
    has: (id) => store.get(sessionId, id) !== undefined,
    ids: () => store.list(sessionId).map((result) => result.id),
    typeOf: (id) => store.get(sessionId, id)?.type,
    countOf: (id) => store.get(sessionId, id)?.count,
  };
}
