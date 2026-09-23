/**
 * `noul()`, `choice()` and `score()`, beside `value()` and `collection()`.
 *
 * The validation here is the same shape as `defineOperation`'s: a malformed question throws
 * `DefinitionError` at definition time, where a person is reading the code, rather than producing
 * a confidently wrong answer at run time where nobody is.
 */

import { DefinitionError } from "../errors.js";
import type { ChoiceQuestion, NoulQuestion, ScoreQuestion } from "./types.js";

const ID = /^[a-z][a-z0-9_]*$/;

/** A choice wider than this is a search problem wearing a classification's clothes. */
export const MAX_OPTIONS = 255;

export const MIN_LEVELS = 2;
/**
 * Ordered levels a person can hold in mind at once. Past ten they stop being distinguishable and
 * the model is being asked to invent a precision the wording does not carry.
 */
export const MAX_LEVELS = 10;

/** A prompt longer than this is carrying state. State belongs in the state, not the question. */
export const MAX_PROMPT = 400;

function checkId(id: string): void {
  if (!ID.test(id)) {
    throw new DefinitionError(
      `Question id '${id}' is invalid; use snake_case such as 'worth_remembering'.`,
    );
  }
}

function checkPrompt(id: string, prompt: string): string {
  const text = prompt.trim();
  if (text.length === 0) throw new DefinitionError(`Question '${id}' needs a prompt.`);
  if (text.length > MAX_PROMPT) {
    throw new DefinitionError(
      `Question '${id}' has a ${text.length}-character prompt; keep it under ${MAX_PROMPT}. ` +
        "A long prompt is usually state, and state belongs in the state.",
    );
  }
  // One question, asked once. A prompt with two question marks is two judgements sharing a
  // threshold, which is the composite shape that measures worst — the same judgement split into
  // atomic parts and recombined scores far better. Use a Decomposition for that.
  if ((text.match(/\?/g) ?? []).length > 1) {
    throw new DefinitionError(
      `Question '${id}' asks more than one question. Split it and combine the answers with a ` +
        "Decomposition; a composite question answered once is the shape that performs worst.",
    );
  }
  return text;
}

function checkDistinct(id: string, what: string, values: readonly string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (value.trim().length === 0)
      throw new DefinitionError(`Question '${id}' has an empty ${what}.`);
    if (seen.has(value))
      throw new DefinitionError(`Question '${id}' repeats the ${what} '${value}'.`);
    seen.add(value);
  }
}

/** A yes/no judgement. The answer's probability is the probability of yes. */
export function noul(id: string, prompt: string, options?: { criteria?: string }): NoulQuestion {
  checkId(id);
  return { kind: "noul", id, prompt: checkPrompt(id, prompt), criteria: options?.criteria };
}

/**
 * One option from a closed set, with an abstain option unless one is refused.
 *
 * `abstain: null` removes it, and is the wrong choice for almost every question: without one a
 * model handed something outside the set does not decline, it picks the least wrong option and
 * reports an ordinary confidence for it. Pass `null` only when the set provably covers every input.
 */
export function choice(
  id: string,
  prompt: string,
  options: readonly string[],
  extra?: { abstain?: string | null; criteria?: string },
): ChoiceQuestion {
  checkId(id);
  const text = checkPrompt(id, prompt);
  const abstain = extra?.abstain === undefined ? "none of these" : extra.abstain;
  if (options.length < MIN_LEVELS) {
    throw new DefinitionError(
      `Question '${id}' needs at least ${MIN_LEVELS} options; a one-option choice is not a decision.`,
    );
  }
  if (options.length > MAX_OPTIONS) {
    throw new DefinitionError(
      `Question '${id}' has ${options.length} options; keep it to ${MAX_OPTIONS}.`,
    );
  }
  checkDistinct(id, "option", options);
  if (abstain !== null && options.includes(abstain)) {
    throw new DefinitionError(
      `Question '${id}' lists '${abstain}' as an option and as the abstain value; it can be one ` +
        "or the other.",
    );
  }
  return {
    kind: "choice",
    id,
    prompt: text,
    options: [...options],
    abstain: abstain ?? undefined,
    criteria: extra?.criteria,
  };
}

/** One level from an ordered set, lowest first. The order carries meaning. */
export function score(
  id: string,
  prompt: string,
  levels: readonly string[],
  options?: { criteria?: string },
): ScoreQuestion {
  checkId(id);
  const text = checkPrompt(id, prompt);
  if (levels.length < MIN_LEVELS || levels.length > MAX_LEVELS) {
    throw new DefinitionError(
      `Question '${id}' has ${levels.length} levels; use between ${MIN_LEVELS} and ${MAX_LEVELS}, ` +
        "lowest first.",
    );
  }
  checkDistinct(id, "level", levels);
  return { kind: "score", id, prompt: text, levels: [...levels], criteria: options?.criteria };
}
