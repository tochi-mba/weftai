import { DefinitionError } from "../errors.js";
import {
  DEFAULT_STORE_LIMITS,
  type ResultStore,
  type SetResult,
  type StoredResult,
} from "./types.js";

export interface MemoryStoreOptions {
  /** How long a result stays available. `Infinity` disables expiry. Default 30 minutes. */
  readonly ttlMs?: number | undefined;
  /** Maximum stored results per session. Oldest are dropped first. Default 200. */
  readonly maxResults?: number | undefined;
  /** Clock, injectable so TTL tests do not depend on fake timers. */
  readonly now?: (() => number) | undefined;
}

interface Entry {
  readonly result: StoredResult;
  readonly expiresAt: number;
}

interface SessionState {
  readonly entries: Map<string, Entry>;
  /** Oldest id first. */
  order: string[];
}

export function createMemoryStore(options: MemoryStoreOptions = {}): ResultStore {
  const ttlMs = options.ttlMs ?? DEFAULT_STORE_LIMITS.ttlMs;
  const maxResults = options.maxResults ?? DEFAULT_STORE_LIMITS.maxResults;
  const now = options.now ?? Date.now;
  if (!(ttlMs > 0)) {
    throw new DefinitionError(
      `Result store ttlMs must be a positive number or Infinity, not ${String(ttlMs)}.`,
    );
  }
  if (!Number.isInteger(maxResults) || maxResults < 1) {
    throw new DefinitionError(
      `Result store maxResults must be an integer of at least 1, not ${String(maxResults)}.`,
    );
  }

  const sessions = new Map<string, SessionState>();

  function sessionOf(sessionId: string): SessionState {
    let session = sessions.get(sessionId);
    if (session === undefined) {
      session = { entries: new Map(), order: [] };
      sessions.set(sessionId, session);
    }
    return session;
  }

  function expire(session: SessionState): void {
    const t = now();
    for (const [id, entry] of session.entries) {
      if (entry.expiresAt <= t) {
        session.entries.delete(id);
        session.order = session.order.filter((stored) => stored !== id);
      }
    }
  }

  function dropIfEmpty(sessionId: string, session: SessionState): void {
    if (session.entries.size === 0) sessions.delete(sessionId);
  }

  function touch(session: SessionState, id: string): void {
    session.order = session.order.filter((stored) => stored !== id);
    session.order.push(id);
  }

  return {
    get(sessionId, id) {
      const session = sessions.get(sessionId);
      if (session === undefined) return undefined;
      expire(session);
      dropIfEmpty(sessionId, session);
      return session.entries.get(id)?.result;
    },

    set(sessionId, result) {
      const session = sessionOf(sessionId);
      expire(session);
      const replaced = session.entries.has(result.id);
      const evicted: string[] = [];
      if (!replaced) {
        while (session.entries.size >= maxResults) {
          const oldest = session.order.shift();
          if (oldest === undefined) break;
          session.entries.delete(oldest);
          evicted.push(oldest);
        }
      }
      const frozen: StoredResult = {
        ...result,
        notices: Object.freeze([...result.notices]),
        items: result.items === undefined ? undefined : Object.freeze([...result.items]),
        storedAt: now(),
      };
      session.entries.set(frozen.id, {
        result: frozen,
        expiresAt: ttlMs === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : now() + ttlMs,
      });
      touch(session, frozen.id);
      const outcome: SetResult = {
        replaced,
        evicted: Object.freeze(evicted),
        cap: evicted.length > 0 ? maxResults : undefined,
      };
      return outcome;
    },

    list(sessionId) {
      const session = sessions.get(sessionId);
      if (session === undefined) return [];
      expire(session);
      dropIfEmpty(sessionId, session);
      return session.order
        .map((id) => session.entries.get(id)?.result)
        .filter((result): result is StoredResult => result !== undefined);
    },

    delete(sessionId, id) {
      const session = sessions.get(sessionId);
      if (session === undefined) return false;
      expire(session);
      const existed = session.entries.delete(id);
      if (existed) session.order = session.order.filter((stored) => stored !== id);
      dropIfEmpty(sessionId, session);
      return existed;
    },

    clear(sessionId) {
      sessions.delete(sessionId);
    },
  };
}
