import { describe, expect, it, vi } from "vitest";
import { choice, noul, score } from "weftai";
import { decodeAnswers, encodeQuestions, LayaDecider } from "./index.js";

const questions = [
  noul("yes", "Is this relevant?", { criteria: "Judge relevance." }),
  choice("pick", "Which subject?", ["music", "work"]),
  score("level", "How useful?", ["low", "high"]),
];
const payload = {
  answers: {
    yes: { type: "noul", noul: 0.1 },
    pick: {
      type: "choice",
      choice: "none of these",
      probabilities: { music: 0.1, work: 0.1, "none of these": 0.8 },
      confidence: 0.99,
    },
    level: { type: "score", score: 0.2, probabilities: { "0": 0.8, "1": 0.2 } },
  },
};

describe("Laya decisions", () => {
  it("uses the host fetch and times out an unavailable service", async () => {
    vi.stubGlobal("fetch", async () => Response.json(payload));
    try {
      expect(
        (await new LayaDecider({ baseUrl: "http://localhost" }).decide("s", questions)).empty,
      ).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
    const decider = new LayaDecider({
      baseUrl: "http://localhost",
      timeoutMs: 1,
      fetch: async (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(new Error("timeout")));
        }),
    });
    expect((await decider.decide("s", questions)).empty).toBe(true);
  });
  it("preserves abstention and the selected value's probability", () => {
    expect(encodeQuestions(questions)).toEqual({
      yes: { type: "noul", instructions: "Is this relevant?\nJudge relevance." },
      pick: {
        type: "choice",
        instructions: "Which subject?",
        criteria: { music: "", work: "", "none of these": "" },
      },
      level: { type: "score", instructions: "How useful?", criteria: ["low", "high"] },
    });
    const result = decodeAnswers(payload, questions);
    expect(result.noul("yes")).toBe(false);
    expect(result.probability("yes")).toBe(0.9);
    expect(result.choice("pick")).toBe("none of these");
    expect(result.probability("pick")).toBe(0.8);
    expect(result.score("level")).toBe("low");
    expect(result.probability("level")).toBe(0.8);
    expect(
      decodeAnswers({ answers: { yes: { type: "noul", noul: 0.7 } } }, questions).noul("yes"),
    ).toBe(true);
    const closed = [choice("pick", "Which?", ["a", "b"], { abstain: null })];
    expect(encodeQuestions(closed)).toEqual({
      pick: { type: "choice", instructions: "Which?", criteria: { a: "", b: "" } },
    });
    expect(
      decodeAnswers(
        { answers: { pick: { type: "choice", choice: "a", probabilities: { a: 0.4, b: 0.6 } } } },
        closed,
      ).probability("pick"),
    ).toBe(0.4);
  });

  it.each([
    null,
    [],
    {},
    { answers: [] },
    { answers: {} },
    { answers: { yes: [] } },
    { answers: { yes: { type: "choice" } } },
    ...[null, true, "0.9", -1, 2, Number.NaN, Number.POSITIVE_INFINITY].map((noul) => ({
      answers: { yes: { type: "noul", noul } },
    })),
    ...[
      null,
      {},
      { music: 1 },
      { music: 1, work: 1, "none of these": 1 },
      { music: false, work: 0, "none of these": 1 },
      { music: 1, work: 0, alien: 0 },
    ].map((probabilities) => ({
      answers: { pick: { type: "choice", choice: "music", probabilities } },
    })),
    ...[null, "invented"].map((choice) => ({
      answers: {
        pick: {
          type: "choice",
          choice,
          probabilities: { music: 0.1, work: 0.1, "none of these": 0.8 },
        },
      },
    })),
  ])("abstains on a malformed batch %j", (body) => {
    expect(decodeAnswers(body, questions).empty).toBe(true);
  });

  it("sends the HTTP contract and rejects oversized or duplicate requests", async () => {
    let calls = 0;
    const decider = new LayaDecider({
      baseUrl: "http://localhost/",
      apiKey: "test-key",
      model: "typed-decisions",
      fetch: async (url, options) => {
        calls++;
        expect(url).toBe("http://localhost/v1/systemone");
        expect(options?.headers).toMatchObject({ Authorization: "Bearer test-key" });
        expect(JSON.parse(String(options?.body)).model).toBe("typed-decisions");
        return Response.json(payload);
      },
    });
    expect((await decider.decide("state", questions)).size).toBe(3);
    expect((await decider.decide("", [])).empty).toBe(true);
    expect((await decider.decide("x".repeat(16001), questions)).empty).toBe(true);
    expect(
      (
        await decider.decide(
          "",
          Array.from({ length: 33 }, () => questions[0]!),
        )
      ).empty,
    ).toBe(true);
    expect((await decider.decide("", [questions[0]!, questions[0]!])).empty).toBe(true);
    expect(calls).toBe(1);
  });

  it.each([{ timeoutMs: 0 }, { timeoutMs: 1.5 }, { maxConcurrent: 0 }, { maxConcurrent: 1.5 }])(
    "rejects invalid limits",
    (options) => {
      expect(() => new LayaDecider({ baseUrl: "http://localhost", ...options })).toThrow();
    },
  );

  it.each([
    () => new Response("secret", { status: 500 }),
    () => new Response(null),
    () => new Response("bad json"),
    () => new Response("x".repeat(262145)),
    () => {
      throw new Error("offline");
    },
  ])("abstains on HTTP or payload failures", async (response) => {
    const decider = new LayaDecider({ baseUrl: "http://localhost", fetch: async () => response() });
    expect((await decider.decide("s", questions)).empty).toBe(true);
  });

  it("refuses excess concurrency and frees the slot", async () => {
    let release!: (r: Response) => void;
    const decider = new LayaDecider({
      baseUrl: "http://localhost",
      timeoutMs: 100,
      maxConcurrent: 1,
      fetch: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    const first = decider.decide("s", questions);
    expect((await decider.decide("s", questions)).empty).toBe(true);
    release(Response.json(payload));
    expect((await first).empty).toBe(false);
    const next = decider.decide("s", questions);
    release(Response.json(payload));
    expect((await next).empty).toBe(false);
  });
});
