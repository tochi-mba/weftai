# Decisions

Operations answer questions about your data. Decisions answer small, closed questions about a
piece of text: does this ticket need a reply today, which team should handle it, how severe is
it. Something you choose — a model behind an endpoint, a classifier, a rules engine — answers
each question with a value and a probability. That something is a **decider**.

Weftai supplies the question and answer types, checks questions when you define them, sends a
turn's questions in one call, calibrates probabilities, and gives you a threshold that falls
back to your existing behaviour whenever there is no confident answer. The wording of the
questions, the thresholds and what each verdict allows stay in your application. Everything on
this page except `LayaDecider` is exported from `weftai`.

```ts
import { Answers, Batch, choice, type Decider, Gate, noul, score } from "weftai";

// A stand-in decider that answers one question and leaves the rest unanswered.
const decider: Decider = {
  async decide(_state, _questions) {
    return new Answers([{ id: "queue", kind: "choice", value: "billing", probability: 0.82 }]);
  },
};

const ticket = "I was charged twice for order 1182. Please refund the second charge.";

const answers = await new Batch()
  .add(
    noul("urgent", "Does this ticket need a reply today?"),
    choice("queue", "Which team should handle this ticket?", ["billing", "shipping", "returns"]),
    score("severity", "How badly is the customer affected?", ["minor", "moderate", "severe"]),
  )
  .ask(decider, ticket);

const routing = new Gate(0.7, "triage"); // "triage" is what the application did before
routing.decide(answers, "queue", answers.choice("queue")); // "billing": answered at 0.82
answers.noul("urgent"); // false: unanswered, so the fallback
answers.score("severity", "moderate"); // "moderate": unanswered, so the fallback given
```

## Questions

| Builder | The answer's `value` |
|---------|----------------------|
| `noul(id, prompt, { criteria? })` | A boolean: a yes/no judgement. |
| `choice(id, prompt, options, { abstain?, criteria? })` | One of `options`, or the abstain label. |
| `score(id, prompt, levels, { criteria? })` | One of `levels`, which are ordered lowest first. |

`criteria` is optional guidance sent with the prompt. The builders throw `DefinitionError` when a
question is malformed, so the mistake shows up where the question is written:

- The id must be snake_case (`QUESTION_ID`, `^[a-z][a-z0-9_]*$`), because answers come back keyed
  by it.
- The prompt must not be empty or longer than 400 characters (`MAX_PROMPT`). A long prompt is
  usually carrying state; send the state as the `state` argument instead.
- The prompt must ask one question: a prompt with two question marks is refused. Split a
  composite judgement into parts and combine them with a [`Decomposition`](#decomposition).
- A choice has 2 to 255 distinct, non-empty options (`MAX_OPTIONS`). It adds the abstain option
  `"none of these"` unless you pass another label, or `abstain: null` to leave it out. Without one,
  a decider handed something outside the set still picks an option, with an ordinary-looking
  probability. The abstain label cannot also be an option.
- A score has 2 to 10 distinct, non-empty levels (`MIN_LEVELS`, `MAX_LEVELS`).

## Answers

A decider returns `Answers`, read by question id. Each `Answer` is `{ id, kind, value,
probability, distribution? }`, where `probability` is the probability of `value` and
`distribution`, when the decider provides one, maps every option or level to its probability.

Every accessor takes a fallback, so an unanswered question never needs a separate check:

| Accessor | Returns |
|----------|---------|
| `answers.noul(id, fallback = false)` | The boolean, or `fallback` if unanswered or not a noul. |
| `answers.choice(id, fallback = "")` | The option, or `fallback`. |
| `answers.score(id, fallback = "")` | The level, or `fallback`. |
| `answers.probability(id, fallback = 0)` | The answer's probability, or `fallback`. |
| `answers.get(id)` / `answers.has(id)` | The raw `Answer` or `undefined` / whether there is one. |
| `answers.size` / `answers.empty` | How many answers came back / whether none did. |

`Answers` is iterable. A choice answered with the abstain label returns that label from
`choice()`; treat it as "none of these".

## Deciders

```ts
interface Decider {
  decide(state: string, questions: readonly AnyQuestion[]): Promise<Answers>;
}
```

A decider must not throw. When it cannot answer — no connection, a timeout, a malformed reply —
it returns empty `Answers`, which every accessor and `Gate` already treat as "decide as before".
`NullDecider` always returns empty `Answers`; wire it when decisions are switched off, so that
"off" and "on but silent" differ only in which decider you hold.

## Batch

`new Batch().add(...questions)` collects a turn's questions so they go to the decider in one call.
`add` refuses a second question with an id already in the batch; `extend(decomposition)` adds a
decomposition's parts. `ask(decider, state)` makes the call, and makes no call at all for an empty
batch. `size` and `questions` read the batch back.

## Gate

`new Gate(threshold, failOpen, { calibration? })` holds a threshold between 0 and 1 and the
verdict to use when it is not met.

- `gate.confident(answers, id)` is true when the question was answered and its calibrated
  probability is at least `threshold`. For a noul that is the probability of yes, so only a yes
  can be confident: a noul answered no with 0.95 has 0.05 on yes. For a choice or a score it is
  the probability of the value given.
- `gate.decide(answers, id, whenConfident)` returns `whenConfident` if `confident` is true and
  `failOpen` otherwise: when the question is unanswered, a noul is answered no, or the answer is
  below the threshold.

So `new Gate(0.8, "carry_on").decide(answers, "looping", "stop")` stops only on a confident yes.
For a choice, `Gate` does not know which option you wanted: pass the answered value as
`whenConfident`, as in `routing.decide(answers, "queue", answers.choice("queue"))`.

`gate.tighten(current, proposed, order)` returns the stricter of two verdicts, where `order` lists
the verdicts from most to least permissive. It can only move a verdict towards the strict end, so
a probabilistic check placed after an authorisation decision can make it stricter but never
looser. A verdict missing from `order` throws `DefinitionError`.

```ts
const order = ["allow", "ask", "deny"];
routing.tighten("allow", "ask", order); // "ask"
routing.tighten("deny", "allow", order); // "deny"
```

## Calibration

A raw probability is only comparable with a threshold if it is calibrated, and deciders are often
over-confident on one kind of question and under-confident on another. `new Calibration({ noul,
choice, score })` applies a temperature per answer kind (above 1 softens, below 1 sharpens; each
must be greater than 0). Kinds without a temperature, and a `new Calibration()`, leave
probabilities unchanged. Fit temperatures on your own labelled examples; they do not transfer
between deciders or domains.

`calibration.probability(answer)` returns one calibrated probability and
`calibration.applied(answers)` a calibrated copy of `Answers`. Give a `Gate` or
`Decomposition.score` a calibration to use it there.

## Decomposition

`new Decomposition(id, questions, weights)` records one judgement split into atomic questions and
recombined with weights you fit. There must be one weight per question, and the weights must sum
to more than 0. Add the parts to a batch with `batch.extend(decomposition)`, then call
`decomposition.score(answers, { calibration? })`.

The score is the weighted mean of each answered part's calibrated probability in favour: the
probability of yes for a noul, and of the value given for a choice or a score. A confident "no" to
a noul part therefore pulls the score down. An unanswered part and its weight are left out, so a
partial answer set does not read as a confident no; with nothing answered the score is 0.

## Laya decider

`@weftai/providers/laya` exports `LayaDecider`, a `Decider` for a Laya decision server. Unlike the
tool adapters it sends a request: `POST <baseUrl>/v1/systemone` with the state, the encoded
questions and the model name.

```ts
import { LayaDecider } from "@weftai/providers/laya";

const decider = new LayaDecider({ baseUrl: "http://127.0.0.1:8010" });
```

| Option | Default | Meaning |
|--------|---------|---------|
| `baseUrl` | required | Server address. Configure it yourself; never take it from model output. |
| `apiKey` | none | Sent as `Authorization: Bearer <apiKey>`. |
| `model` | `""` | Model name; empty lets the server choose. |
| `timeoutMs` | `1000` | Per-request timeout, a positive integer. |
| `maxConcurrent` | `2` | Calls allowed in flight at once on this instance, a positive integer. |
| `fetch` | `globalThis.fetch` | The `fetch` implementation to use. |

It returns empty `Answers`, without sending anything, for an empty question list, more than 32
questions, duplicate ids, a state over 16,000 UTF-8 bytes, or when `maxConcurrent` calls are
already in flight. It also returns empty `Answers` for a non-2xx status, a redirect, a timeout, a
network error, a reply over 256 KiB, or a reply that is malformed anywhere; nothing is truncated.
A question missing from a well-formed reply is simply unanswered. A noul answer's `value` is
whether the server's probability of yes is at least 0.5, and its `probability` is the probability
of that value. A score answer is the most probable level, the first one on a tie.
