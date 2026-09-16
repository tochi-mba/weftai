import { z } from "weftai";

export const Contract = z.object({
  id: z.string(),
  title: z.string(),
  owner: z.string(),
  expiresOn: z.string(),
});
export type Contract = z.infer<typeof Contract>;

export interface DocumentsContext {
  readonly contracts: readonly Contract[];
  /** ISO date the domain treats as today, so expiry math is deterministic in tests. */
  readonly now: string;
}
