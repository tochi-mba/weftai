/**
 * Typed decisions: closed questions, calibrated answers, and a gate that fails open.
 *
 * ```ts
 * import { Batch, Gate, choice, noul } from "weftai";
 *
 * const questions = new Batch().add(
 *   noul("worth_remembering", "Would a person want this recalled in a later conversation?"),
 *   choice("kind", "What kind of note is this?", ["fact", "episode", "procedure"]),
 * );
 * const answers = await questions.ask(decider, state);
 *
 * const gate = new Gate(0.6, "episode");
 * const kind = gate.decide(answers, "kind", answers.choice("kind"));
 * ```
 *
 * The wording, the thresholds and the authority stay with the host. What is here is the part that
 * is the same everywhere: the shapes, the validation that catches a composite question before it
 * ships, one round trip per turn, calibration per answer kind, and a threshold whose unanswered
 * case is "behave exactly as before".
 */

export {
  choice,
  MAX_LEVELS,
  MAX_OPTIONS,
  MAX_PROMPT,
  MIN_LEVELS,
  noul,
  score,
} from "./build.js";
export { Batch, Calibration, Decomposition, Gate } from "./gate.js";
export {
  type Answer,
  type AnswerKind,
  Answers,
  type AnyQuestion,
  type ChoiceQuestion,
  type Decider,
  type NoulQuestion,
  NullDecider,
  QUESTION_ID,
  type ScoreQuestion,
} from "./types.js";
