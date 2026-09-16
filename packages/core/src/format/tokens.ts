/** Default estimator: four characters per token. Replace with a real tokenizer when measuring. */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

export interface FormatBudgets {
  /** Token budget for a terminal (unreferenced) step body. */
  readonly read: number;
  /** Token budget for a referenced intermediate step body. */
  readonly preview: number;
  /** Ceiling for the whole response. Headers are always kept. */
  readonly total: number;
}

export const DEFAULT_BUDGETS: FormatBudgets = {
  read: 2000,
  preview: 400,
  total: 8000,
};
