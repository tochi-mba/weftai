import type { ResultType } from "../schema/types.js";

export type ResultKind = ResultType["kind"];

/** A named result stored for the rest of a session, including later tool calls. */
export interface StoredResult {
  readonly id: string;
  readonly operation: string;
  readonly kind: ResultKind;
  /** Collection name a `$ref` to this result resolves to, when it has provenance. */
  readonly type: string | undefined;
  readonly data: unknown;
  /** Frozen items when this result has provenance; ordinals index this array. */
  readonly items: readonly unknown[] | undefined;
  readonly count: number | undefined;
  readonly notices: readonly string[];
  readonly storedAt: number;
}

export interface SetResult {
  readonly replaced: boolean;
  /** Ids dropped (oldest first) to stay within the session cap. */
  readonly evicted: readonly string[];
  /** The cap that triggered eviction, when the store has one. */
  readonly cap: number | undefined;
}

/**
 * Session-scoped storage for step results. Implementations must not mutate a `StoredResult` after
 * `set` returns; ordinals are frozen at store time.
 */
export interface ResultStore {
  get(sessionId: string, id: string): StoredResult | undefined;
  set(sessionId: string, result: StoredResult): SetResult;
  list(sessionId: string): readonly StoredResult[];
  delete(sessionId: string, id: string): boolean;
  clear(sessionId: string): void;
}

export const DEFAULT_SESSION_ID = "default";

export const DEFAULT_STORE_LIMITS = {
  ttlMs: 30 * 60 * 1000,
  maxResults: 200,
} as const;
