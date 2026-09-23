import { describe, expect, it } from "vitest";
import { DefinitionError } from "../errors.js";
import { choice, MAX_OPTIONS, MAX_PROMPT, noul, score } from "./build.js";
import { Batch, Calibration, Decomposition, Gate } from "./gate.js";
import { type Answer, Answers, NullDecider } from "./types.js";

const noulAnswer = (id: string, value: boolean, probability: number): Answer => ({
  id,
  kind: "noul",
  value,
  probability,
});

describe("builders", () => {
  it("keeps a noul's wording and criteria", () => {
    const question = noul("is_instructing", "  Does the text request an action?  ", {
      criteria: "Imperative.",
    });
    expect(question.kind).toBe("noul");
    expect(question.prompt).toBe("Does the text request an action?");
    expect(question.criteria).toBe("Imperative.");
  });

  it("adds an abstain option to a choice by default", () => {
    expect(choice("kind", "What kind?", ["fact", "episode"]).abstain).toBe("none of these");
  });

  it("lets abstain be refused explicitly", () => {
    expect(
      choice("side", "Which side?", ["left", "right"], { abstain: null }).abstain,
    ).toBeUndefined();
  });

  it("keeps score levels in order", () => {
    expect(score("still_needed", "Still needed?", ["no", "maybe", "yes"]).levels).toEqual([
      "no",
      "maybe",
      "yes",
    ]);
  });

  it.each(["Worth_Remembering", "worth-remembering", "1st", "", "_x"])(
    "refuses the id %s",
    (bad) => {
      expect(() => noul(bad, "Does it matter?")).toThrow(DefinitionError);
    },
  );

  it("refuses an empty prompt", () => {
    expect(() => noul("worth_remembering", "   ")).toThrow(/needs a prompt/);
  });

  it("refuses an overlong prompt as state", () => {
    expect(() => noul("worth_remembering", "x".repeat(MAX_PROMPT + 1))).toThrow(/character prompt/);
  });

  it("refuses a composite question", () => {
    expect(() => noul("worth_it", "Is it durable? Is it about the person?")).toThrow(
      /more than one question/,
    );
  });

  it("allows a single question mark", () => {
    expect(noul("worth_it", "Is this durable?").prompt).toMatch(/\?$/);
  });

  it("allows a prompt with no question mark at all", () => {
    // `String.match` returns null rather than an empty array when nothing matches.
    expect(noul("worth_it", "Whether this is durable.").prompt).toBe("Whether this is durable.");
  });

  it("refuses a one-option choice", () => {
    expect(() => choice("kind", "Which?", ["only"])).toThrow(/at least/);
  });

  it("refuses too many options", () => {
    const many = Array.from({ length: MAX_OPTIONS + 1 }, (_, i) => `option${i}`);
    expect(() => choice("kind", "Which?", many)).toThrow(/options/);
  });

  it("refuses a repeated or empty option", () => {
    expect(() => choice("kind", "Which?", ["fact", "fact"])).toThrow(/repeats the option/);
    expect(() => choice("kind", "Which?", ["fact", "  "])).toThrow(/empty option/);
  });

  it("refuses an abstain that duplicates an option", () => {
    expect(() => choice("kind", "Which?", ["fact", "unknown"], { abstain: "unknown" })).toThrow(
      /one or the other/,
    );
  });

  // Wrapped one level deeper: `it.each` spreads the outer array, so each case must itself be
  // the argument list, or a one-element array of levels arrives as a bare string.
  it.each([[["only"]], [Array.from({ length: 11 }, (_, i) => `l${i}`)]])(
    "refuses a score with %s levels",
    (levels: readonly string[]) => {
      expect(() => score("effort", "How much?", levels)).toThrow(/levels/);
    },
  );

  it("refuses a repeated or empty level", () => {
    expect(() => score("effort", "How much?", ["low", "low"])).toThrow(/repeats the level/);
    expect(() => score("effort", "How much?", ["low", " "])).toThrow(/empty level/);
  });
});

describe("answers", () => {
  it("reads as its fallbacks when empty", () => {
    const answers = new Answers();
    expect(answers.empty).toBe(true);
    expect(answers.size).toBe(0);
    expect(answers.get("missing")).toBeUndefined();
    expect(answers.probability("missing")).toBe(0);
    expect(answers.probability("missing", 0.5)).toBe(0.5);
    expect(answers.noul("missing")).toBe(false);
    expect(answers.noul("missing", true)).toBe(true);
    expect(answers.choice("missing")).toBe("");
    expect(answers.score("missing", "episode")).toBe("episode");
  });

  it("reads by id and iterates", () => {
    const answers = new Answers([
      noulAnswer("a", true, 0.9),
      { id: "b", kind: "choice", value: "fact", probability: 0.7 },
    ]);
    expect(answers.empty).toBe(false);
    expect(answers.size).toBe(2);
    expect(answers.has("a")).toBe(true);
    expect(answers.noul("a")).toBe(true);
    expect(answers.choice("b")).toBe("fact");
    expect([...answers].map((a) => a.id).sort()).toEqual(["a", "b"]);
  });

  it("gives the fallback when an answer is read as the wrong kind", () => {
    // A choice read as a noul is a host bug; it must not read as a confident yes.
    const answers = new Answers([{ id: "kind", kind: "choice", value: "fact", probability: 0.99 }]);
    expect(answers.noul("kind")).toBe(false);
    expect(answers.score("kind", "episode")).toBe("episode");
    expect(answers.choice("kind")).toBe("fact");
  });

  it("reads a score back as its level", () => {
    const answers = new Answers([
      { id: "still_needed", kind: "score", value: "likely", probability: 0.8 },
    ]);
    expect(answers.score("still_needed")).toBe("likely");
    expect(answers.choice("still_needed")).toBe("");
  });
});

describe("calibration", () => {
  it("leaves a probability alone by default", () => {
    expect(new Calibration().probability(noulAnswer("a", true, 0.7))).toBeCloseTo(0.7);
  });

  it("softens an over-confident kind and sharpens an under-confident one", () => {
    const softened = new Calibration({ choice: 3 }).probability({
      id: "k",
      kind: "choice",
      value: "x",
      probability: 0.9,
    });
    expect(softened).toBeGreaterThan(0.5);
    expect(softened).toBeLessThan(0.9);
    expect(new Calibration({ noul: 0.66 }).probability(noulAnswer("a", true, 0.7))).toBeGreaterThan(
      0.7,
    );
  });

  it("only applies to its own kind", () => {
    expect(new Calibration({ choice: 3 }).probability(noulAnswer("a", true, 0.9))).toBeCloseTo(0.9);
  });

  it("clamps a malformed probability rather than producing a NaN", () => {
    expect(new Calibration().probability(noulAnswer("a", true, 1.4))).toBe(1);
    expect(new Calibration().probability(noulAnswer("a", true, -0.2))).toBe(0);
    const tempered = new Calibration({ noul: 2 }).probability(noulAnswer("a", true, 0));
    expect(tempered).toBeGreaterThan(0);
    expect(tempered).toBeLessThan(0.5);
  });

  it("calibrates every answer without moving the values", () => {
    const applied = new Calibration({ choice: 3 }).applied(
      new Answers([{ id: "k", kind: "choice", value: "fact", probability: 0.9 }]),
    );
    expect(applied.choice("k")).toBe("fact");
    expect(applied.probability("k")).toBeLessThan(0.9);
  });

  it("refuses a temperature of zero or less", () => {
    expect(() => new Calibration({ noul: 0 })).toThrow(/greater than zero/);
  });
});

describe("gate", () => {
  it("passes a confident answer and fails open otherwise", () => {
    const gate = new Gate(0.6, "jaccard");
    expect(gate.decide(new Answers([noulAnswer("fired", true, 0.9)]), "fired", "model")).toBe(
      "model",
    );
    expect(gate.decide(new Answers(), "fired", "model")).toBe("jaccard");
    expect(gate.decide(new Answers([noulAnswer("fired", true, 0.4)]), "fired", "model")).toBe(
      "jaccard",
    );
  });

  it("treats the threshold as inclusive", () => {
    expect(new Gate(0.6, "x").confident(new Answers([noulAnswer("f", true, 0.6)]), "f")).toBe(true);
  });

  it("applies its calibration before comparing", () => {
    const gate = new Gate(0.8, "off", { calibration: new Calibration({ choice: 3 }) });
    const answers = new Answers([{ id: "k", kind: "choice", value: "fact", probability: 0.85 }]);
    expect(gate.confident(answers, "k")).toBe(false);
  });

  it.each([-0.1, 1.1])("refuses the threshold %f", (threshold) => {
    expect(() => new Gate(threshold, null)).toThrow(/outside/);
  });

  it("moves only toward the stricter verdict", () => {
    const gate = new Gate(0.5, "allow");
    const order = ["allow", "ask", "deny"];
    expect(gate.tighten("allow", "ask", order)).toBe("ask");
    expect(gate.tighten("ask", "allow", order)).toBe("ask");
    expect(gate.tighten("deny", "allow", order)).toBe("deny");
    expect(gate.tighten("ask", "ask", order)).toBe("ask");
  });

  it("refuses a verdict outside the stated order", () => {
    const gate = new Gate(0.5, "allow");
    expect(() => gate.tighten("sideways", "ask", ["allow", "ask"])).toThrow(/stated order/);
    expect(() => gate.tighten("allow", "sideways", ["allow", "ask"])).toThrow(/stated order/);
  });
});

describe("decomposition", () => {
  const parts = () =>
    new Decomposition(
      "worth_remembering",
      [noul("durable", "Is this true beyond today?"), noul("about_person", "Is this about them?")],
      [0.7, 0.3],
    );

  it("combines by weight", () => {
    const answers = new Answers([
      noulAnswer("durable", true, 1),
      noulAnswer("about_person", true, 0),
    ]);
    expect(parts().score(answers)).toBeCloseTo(0.7);
  });

  it("drops an unanswered part from the denominator", () => {
    expect(parts().score(new Answers([noulAnswer("durable", true, 0.8)]))).toBeCloseTo(0.8);
  });

  it("scores zero when nothing was answered", () => {
    expect(parts().score(new Answers())).toBe(0);
  });

  it("applies calibration", () => {
    const answers = new Answers([
      noulAnswer("durable", true, 0.9),
      noulAnswer("about_person", true, 0.9),
    ]);
    expect(parts().score(answers, { calibration: new Calibration({ noul: 3 }) })).toBeLessThan(
      parts().score(answers),
    );
  });

  it("refuses a malformed definition", () => {
    expect(() => new Decomposition("empty", [], [])).toThrow(/no questions/);
    expect(() => new Decomposition("bad", [noul("a", "Is it?")], [0.5, 0.5])).toThrow(
      /one weight per question/,
    );
    expect(() => new Decomposition("bad", [noul("a", "Is it?")], [0])).toThrow(/summing to/);
  });
});

describe("batch", () => {
  it("does not call the decider when empty", async () => {
    const exploding = {
      decide: async () => {
        throw new Error("must not be called");
      },
    };
    expect((await new Batch().ask(exploding, "state")).empty).toBe(true);
  });

  it("asks every question in one call", async () => {
    const seen: number[] = [];
    const counting = {
      decide: async (_state: string, questions: readonly unknown[]) => {
        seen.push(questions.length);
        return new Answers([noulAnswer("a", true, 0.9)]);
      },
    };
    const batch = new Batch()
      .add(noul("a", "Is it?"))
      .extend(new Decomposition("d", [noul("b", "Is it?"), noul("c", "Is it?")], [0.5, 0.5]));
    expect(batch.size).toBe(3);
    const answers = await batch.ask(counting, "state");
    expect(seen).toEqual([3]);
    expect(answers.noul("a")).toBe(true);
  });

  it("refuses a duplicate id", () => {
    const batch = new Batch().add(noul("a", "Is it?"));
    expect(() => batch.add(choice("a", "Which?", ["x", "y"]))).toThrow(/already in this batch/);
  });

  it("exposes its questions in order", () => {
    const batch = new Batch().add(noul("a", "Is it?"), noul("b", "Is it though?"));
    expect(batch.questions.map((q) => q.id)).toEqual(["a", "b"]);
  });

  it("answers nothing through the null decider", async () => {
    expect((await new NullDecider().decide("state", [noul("a", "Is it?")])).empty).toBe(true);
  });
});
