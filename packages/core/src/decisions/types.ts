/**
 * Typed questions, their answers, and the seam a decision model sits behind.
 *
 * A decision model takes a state and a set of questions with closed answer sets, and returns a
 * value per question with a probability. It writes nothing. Every agent host already asks these
 * questions — is this worth remembering, is this a loop, which of these tools is relevant — and
 * answers them with regexes and thresholds, so the primitives belong here rather than being
 * rewritten per host.
 *
 * Three kinds, because that is what such a model can answer: `noul` (a yes/no judgement, whose
 * probability is the probability of yes), `choice` (one option from a closed set) and `score`
 * (one level from an ordered set).
 *
 * The wording, the thresholds and the authority are the host's: nothing here says what 0.6
 * means. What it does say is that a question must be answerable on its own, which is the one rule
 * the measurements are unambiguous about — a composite question asked once scores far worse than
 * the same judgement split into atomic parts and recombined. `Decomposition` is how a host writes
 * the split down.
 */

/** What shape an answer takes, beside `ResultKind` for operation output. */
export type AnswerKind = "noul" | "choice" | "score";

/** Question ids are snake_case so an answer can be read back by name in either language. */
export const QUESTION_ID = "^[a-z][a-z0-9_]*$";

/** A yes/no judgement. `probability` in the answer is the probability of yes. */
export interface NoulQuestion {
  readonly kind: "noul";
  readonly id: string;
  readonly prompt: string;
  readonly criteria?: string | undefined;
}

/**
 * One option from a closed set. `abstain` is the option meaning "none of these".
 *
 * A model with no "unknown" option does not decline; it picks the least wrong answer and reports
 * a perfectly ordinary confidence for it. An explicit abstain option is the only thing that makes
 * "this is outside the set" expressible, which is why `choice()` adds one unless a caller opts
 * out.
 */
export interface ChoiceQuestion {
  readonly kind: "choice";
  readonly id: string;
  readonly prompt: string;
  readonly options: readonly string[];
  readonly abstain?: string | undefined;
  readonly criteria?: string | undefined;
}

/** One level from an ordered set, lowest first. Ordering is part of the meaning. */
export interface ScoreQuestion {
  readonly kind: "score";
  readonly id: string;
  readonly prompt: string;
  readonly levels: readonly string[];
  readonly criteria?: string | undefined;
}

export type AnyQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;

/**
 * One question's answer: the value, how confident the model is, and the distribution.
 *
 * `probability` is the probability of `value` specifically, which is the number a threshold should
 * be compared against — not the maximum of `distribution`, which is the same number only when the
 * model picked its own argmax.
 */
export interface Answer {
  readonly id: string;
  readonly kind: AnswerKind;
  /** A boolean for a noul, the chosen option for a choice, the chosen level for a score. */
  readonly value: boolean | string;
  readonly probability: number;
  readonly distribution?: Readonly<Record<string, number>> | undefined;
}

/**
 * What came back, read by question id, and safe to read when nothing came back.
 *
 * Every accessor takes a default, because a host that has to check for absence at each call site
 * will eventually forget at one of them, and the failure mode of forgetting is acting on an answer
 * that does not exist.
 */
export class Answers implements Iterable<Answer> {
  readonly #byId: Map<string, Answer>;

  constructor(answers: readonly Answer[] = []) {
    this.#byId = new Map(answers.map((answer) => [answer.id, answer]));
  }

  get size(): number {
    return this.#byId.size;
  }

  /** True when the decider answered nothing, which is every fail-open path. */
  get empty(): boolean {
    return this.#byId.size === 0;
  }

  [Symbol.iterator](): Iterator<Answer> {
    return this.#byId.values();
  }

  has(id: string): boolean {
    return this.#byId.has(id);
  }

  get(id: string): Answer | undefined {
    return this.#byId.get(id);
  }

  /** The probability of the answered value, or `fallback` when unanswered. */
  probability(id: string, fallback = 0): number {
    return this.#byId.get(id)?.probability ?? fallback;
  }

  noul(id: string, fallback = false): boolean {
    const answer = this.#byId.get(id);
    if (answer === undefined || answer.kind !== "noul") return fallback;
    return Boolean(answer.value);
  }

  choice(id: string, fallback = ""): string {
    const answer = this.#byId.get(id);
    if (answer === undefined || answer.kind !== "choice") return fallback;
    return String(answer.value);
  }

  score(id: string, fallback = ""): string {
    const answer = this.#byId.get(id);
    if (answer === undefined || answer.kind !== "score") return fallback;
    return String(answer.value);
  }
}

/**
 * Whoever answers the questions.
 *
 * Implementations must not throw: a host places this on a turn's hot path, and a decision layer
 * that can fail a turn is not worth the accuracy it buys. Return empty `Answers` instead, which
 * every reader above already treats as "decide as before".
 */
export interface Decider {
  decide(state: string, questions: readonly AnyQuestion[]): Promise<Answers>;
}

/**
 * Answers nothing, always. The shape of every fail-open path, and a host's default.
 *
 * A host wires this when there is no key, no configured model, or the feature is off, so the only
 * difference between "decisions disabled" and "decisions enabled but silent" is which object is
 * on the container — never a branch at each call site.
 */
export class NullDecider implements Decider {
  async decide(_state: string, _questions: readonly AnyQuestion[]): Promise<Answers> {
    return new Answers();
  }
}
