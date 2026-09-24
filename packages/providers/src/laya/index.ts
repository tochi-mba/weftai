/** Laya HTTP decisions, with selected-value probabilities and bounded fail-open calls. */
import { type Answer, Answers, type AnyQuestion, type Decider } from "weftai";

const MAX_STATE_BYTES = 16_000;
const MAX_QUESTIONS = 32;
const MAX_RESPONSE_BYTES = 262_144;

export function encodeQuestions(questions: readonly AnyQuestion[]): Record<string, unknown> {
  return Object.fromEntries(
    questions.map((q) => [
      q.id,
      {
        type: q.kind,
        instructions: q.prompt + (q.criteria ? `\n${q.criteria}` : ""),
        ...(q.kind === "choice"
          ? {
              criteria: Object.fromEntries(
                [...q.options, ...(q.abstain ? [q.abstain] : [])].map((o) => [o, ""]),
              ),
            }
          : q.kind === "score"
            ? { criteria: q.levels }
            : {}),
      },
    ]),
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function probability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function decodeAnswers(payload: unknown, questions: readonly AnyQuestion[]): Answers {
  if (!record(payload) || !record(payload.answers)) return new Answers();
  const answers: Answer[] = [];
  for (const q of questions) {
    if (!Object.hasOwn(payload.answers, q.id)) continue;
    const row = payload.answers[q.id];
    if (!record(row) || row.type !== q.kind) return new Answers();
    if (q.kind === "noul") {
      if (!probability(row.noul)) return new Answers();
      const value = row.noul >= 0.5;
      answers.push({ id: q.id, kind: q.kind, value, probability: value ? row.noul : 1 - row.noul });
      continue;
    }
    const labels =
      q.kind === "choice" ? [...q.options, ...(q.abstain ? [q.abstain] : [])] : q.levels;
    const keys = q.kind === "choice" ? labels : labels.map((_, i) => String(i));
    const raw = row.probabilities;
    if (
      !record(raw) ||
      Object.keys(raw).length !== keys.length ||
      !keys.every((key) => Object.hasOwn(raw, key) && probability(raw[key]))
    )
      return new Answers();
    const values = keys.map((key) => raw[key] as number);
    if (Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 0.01) return new Answers();
    const distribution = Object.fromEntries(labels.map((label, i) => [label, values[i] as number]));
    const selected = q.kind === "choice" ? row.choice : labels[values.indexOf(Math.max(...values))];
    if (typeof selected !== "string" || !Object.hasOwn(distribution, selected))
      return new Answers();
    answers.push({
      id: q.id,
      kind: q.kind,
      value: selected,
      probability: distribution[selected] as number,
      distribution,
    });
  }
  return new Answers(answers);
}

export interface LayaOptions {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly maxConcurrent?: number;
  readonly fetch?: typeof globalThis.fetch;
}

export class LayaDecider implements Decider {
  readonly #options: LayaOptions;
  readonly #timeout: number;
  readonly #concurrent: number;
  #active = 0;

  constructor(options: LayaOptions) {
    this.#options = options;
    this.#timeout = options.timeoutMs ?? 1000;
    this.#concurrent = options.maxConcurrent ?? 2;
    if (
      !Number.isInteger(this.#timeout) ||
      this.#timeout <= 0 ||
      !Number.isInteger(this.#concurrent) ||
      this.#concurrent <= 0
    ) {
      throw new Error("Timeout and concurrency must be positive integers");
    }
  }

  async decide(state: string, questions: readonly AnyQuestion[]): Promise<Answers> {
    if (
      questions.length === 0 ||
      questions.length > MAX_QUESTIONS ||
      new Set(questions.map((q) => q.id)).size !== questions.length ||
      new TextEncoder().encode(state).length > MAX_STATE_BYTES ||
      this.#active >= this.#concurrent
    ) {
      return new Answers();
    }
    this.#active++;
    try {
      const response = await (this.#options.fetch ?? globalThis.fetch)(
        `${this.#options.baseUrl.replace(/\/$/, "")}/v1/systemone`,
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(this.#timeout),
          headers: {
            "Content-Type": "application/json",
            ...(this.#options.apiKey ? { Authorization: `Bearer ${this.#options.apiKey}` } : {}),
          },
          body: JSON.stringify({
            state,
            questions: encodeQuestions(questions),
            model: this.#options.model ?? "",
          }),
        },
      );
      if (!response.ok || !response.body) return new Answers();
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_RESPONSE_BYTES) return new Answers();
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      return decodeAnswers(JSON.parse(Buffer.concat(chunks).toString("utf8")), questions);
    } catch {
      return new Answers();
    } finally {
      this.#active--;
    }
  }
}
