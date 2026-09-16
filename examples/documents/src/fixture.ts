import type { Contract } from "./types.js";

/** Contracts around 2026-09-15 so expiry windows stay stable in tests. */
export const NOW = "2026-09-15";

export const fixture: readonly Contract[] = [
  { id: "c1", title: "Acme MSA", owner: "legal", expiresOn: "2026-10-01" },
  { id: "c2", title: "Beta NDA", owner: "legal", expiresOn: "2027-01-01" },
  { id: "c3", title: "Gamma SOW", owner: "ops", expiresOn: "2026-09-20" },
  { id: "c4", title: "Delta MSA", owner: "ops", expiresOn: "2026-12-01" },
];
