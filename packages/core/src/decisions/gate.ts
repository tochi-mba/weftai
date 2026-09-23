/**
 * Reading an answer safely: calibration, a threshold that fails open, and one round trip.
 *
 * Three things every host otherwise re-derives, and gets wrong in the same three ways.
 *
 * **Calibration.** A probability is only a number a threshold can be compared against if it is
 * calibrated, and published measurements put the error at several times the noise floor with the
 * *direction* differing by kind — yes/no answers under-confident, choices and scores over. So a raw
 * 0.8 from a noul and a raw 0.8 from a choice are not the same evidence. `Calibration` applies a
 * temperature per kind. Its identity is the default, because a host that has not measured anything
 * should not be silently adjusted.
 *
 * **Failing open.** `Gate` returns its `failOpen` verdict whenever there is no answer, the answer is
 * the wrong kind, or the confidence is below the threshold. A host wires the verdict that means "do
 * exactly what the code did before".
 *
 * **Monotone composition.** `Gate.tighten` can move a verdict one way only. That is what lets a
 * probabilistic call sit beside an authority decision: at worst it asks, escapes or holds something
 * it need not have, and never grants, promotes or skips.
 */

import { DefinitionError } from "../errors.js";
import { type Answer, type AnswerKind, Answers, type AnyQuestion, type Decider } from "./types.js";

/**
 * Temperature scaling on a single probability, clamped away from the asymptotes.
 *
 * Below zero and above one cannot come back from a well-formed decider, but they can come back from
 * a malformed payload, and a malformed payload must not produce a NaN that then compares false
 * against every threshold and silently disables the gate.
 */
function temper(probability: number, temperature: number): number {
  if (temperature === 1) return Math.min(1, Math.max(0, probability));
  const p = Math.min(1 - 1e-9, Math.max(1e-9, probability));
  const logit = Math.log(p / (1 - p)) / temperature;
  return 1 / (1 + Math.exp(-logit));
}

/**
 * Per-kind temperature. Above 1 softens an over-confident kind, below 1 sharpens.
 *
 * Temperatures come from a host's own measurement against its own distribution; they do not
 * transfer between them, which is why there is no table of good values here.
 */
export class Calibration {
  readonly temperatures: Readonly<Partial<Record<AnswerKind, number>>>;

  constructor(temperatures: Partial<Record<AnswerKind, number>> = {}) {
    for (const [kind, temperature] of Object.entries(temperatures)) {
      if (temperature !== undefined && temperature <= 0) {
        throw new DefinitionError(
          `Temperature for '${kind}' is ${temperature}; it must be greater than zero.`,
        );
      }
    }
    this.temperatures = { ...temperatures };
  }

  /** The answer's probability with this kind's temperature applied. */
  probability(answer: Answer): number {
    return temper(answer.probability, this.temperatures[answer.kind] ?? 1);
  }

  /** The same answers with every probability calibrated. The values do not move. */
  applied(answers: Answers): Answers {
    return new Answers(
      [...answers].map((answer) => ({ ...answer, probability: this.probability(answer) })),
    );
  }
}

/**
 * A threshold over one question, with the verdict to use when it is not met.
 *
 * `failOpen` is returned for an unanswered question, a wrong-kind answer, or a confidence below
 * `threshold` — the three ways a decision can be absent rather than negative.
 */
export class Gate<V> {
  readonly threshold: number;
  readonly failOpen: V;
  readonly calibration: Calibration;

  constructor(threshold: number, failOpen: V, options?: { calibration?: Calibration }) {
    if (!(threshold >= 0 && threshold <= 1)) {
      throw new DefinitionError(`Threshold ${threshold} is outside 0..1.`);
    }
    this.threshold = threshold;
    this.failOpen = failOpen;
    this.calibration = options?.calibration ?? new Calibration();
  }

  /** Whether this question was answered at or above the threshold, after calibration. */
  confident(answers: Answers, id: string): boolean {
    const answer = answers.get(id);
    if (answer === undefined) return false;
    return this.calibration.probability(answer) >= this.threshold;
  }

  /** `whenConfident` if the question cleared the threshold, `failOpen` otherwise. */
  decide(answers: Answers, id: string, whenConfident: V): V {
    return this.confident(answers, id) ? whenConfident : this.failOpen;
  }

  /**
   * The stricter of two verdicts, by a stated order from most to least permissive.
   *
   * The order is passed in rather than inferred because "stricter" is the host's word: for one use
   * it means asking a person, for another it means keeping a result. Passing it at the call site is
   * also what makes the direction reviewable there.
   */
  tighten(current: V, proposed: V, order: readonly V[]): V {
    const currentIndex = order.indexOf(current);
    const proposedIndex = order.indexOf(proposed);
    if (currentIndex < 0) {
      throw new DefinitionError(`Verdict ${String(current)} is not in the stated order.`);
    }
    if (proposedIndex < 0) {
      throw new DefinitionError(`Verdict ${String(proposed)} is not in the stated order.`);
    }
    return proposedIndex > currentIndex ? proposed : current;
  }
}

/**
 * One judgement split into atomic questions and recombined with fitted weights.
 *
 * A composite question answered once measures far worse than the same judgement split into parts
 * and weighted — the gap is the difference between losing to a small frontier model and beating it.
 * The weights are fitted by the host against its own labelled examples; this class owns only the
 * combination and its validation.
 */
export class Decomposition {
  readonly id: string;
  readonly questions: readonly AnyQuestion[];
  readonly weights: readonly number[];
  readonly #pairs: readonly (readonly [AnyQuestion, number])[];

  constructor(id: string, questions: readonly AnyQuestion[], weights: readonly number[]) {
    if (questions.length === 0)
      throw new DefinitionError(`Decomposition '${id}' has no questions.`);
    if (questions.length !== weights.length) {
      throw new DefinitionError(
        `Decomposition '${id}' has ${questions.length} questions and ${weights.length} weights; ` +
          "there must be one weight per question.",
      );
    }
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (total <= 0) {
      throw new DefinitionError(`Decomposition '${id}' has weights summing to ${total}.`);
    }
    this.id = id;
    this.questions = [...questions];
    this.weights = [...weights];
    // Paired once, here, where the lengths have just been proven equal. Indexing one array by
    // the other's position would leave a `?? 0` that can never fire and can never be tested.
    this.#pairs = questions.map((question, index) => [question, weights[index] as number]);
  }

  /**
   * The weighted combination, over the questions that were actually answered.
   *
   * An unanswered question contributes nothing and its weight leaves the denominator, so a partial
   * answer set degrades smoothly instead of reading as a confident no. With nothing answered the
   * score is 0, which every threshold above zero rejects — the fail-open result.
   */
  score(answers: Answers, options?: { calibration?: Calibration }): number {
    const calibration = options?.calibration ?? new Calibration();
    let weighted = 0;
    let available = 0;
    for (const [question, weight] of this.#pairs) {
      const answer = answers.get(question.id);
      if (answer === undefined) continue;
      available += weight;
      weighted += weight * calibration.probability(answer);
    }
    return available === 0 ? 0 : weighted / available;
  }
}

/**
 * Every question a turn wants, asked in one round trip.
 *
 * Adding questions barely moves the latency of such a model and they are answered independently, so
 * the cost of a turn's decisions is one call, not one call per question — but only if the host
 * collects them first. Collecting them is fiddly and pays for itself once, which is why it lives
 * here.
 */
export class Batch {
  readonly #questions: AnyQuestion[] = [];
  readonly #seen = new Set<string>();

  get size(): number {
    return this.#questions.length;
  }

  get questions(): readonly AnyQuestion[] {
    return [...this.#questions];
  }

  /** Add questions, refusing a duplicate id — two answers cannot share one name. */
  add(...questions: readonly AnyQuestion[]): this {
    for (const question of questions) {
      if (this.#seen.has(question.id)) {
        throw new DefinitionError(
          `Question '${question.id}' is already in this batch; ids must be unique because the ` +
            "answers come back keyed by them.",
        );
      }
      this.#seen.add(question.id);
      this.#questions.push(question);
    }
    return this;
  }

  /** Add every question of a decomposition. */
  extend(decomposition: Decomposition): this {
    return this.add(...decomposition.questions);
  }

  /** One call. An empty batch does not call at all, and a decider must not throw. */
  async ask(decider: Decider, state: string): Promise<Answers> {
    if (this.#questions.length === 0) return new Answers();
    return await decider.decide(state, this.questions);
  }
}
