# Laya decisions

Import `LayaDecider` from `@weftai/providers/laya` and questions from `weftai`.

```ts
const decider = new LayaDecider({ baseUrl: "http://127.0.0.1:8010" });
const answers = await decider.decide("Find some jazz", [
  choice("capability", "Which capability is relevant?", ["music", "research"]),
]);
```

The matching Python API is `weftai.providers.laya.LayaDecider(client, base_url)`;
the caller owns the `httpx.AsyncClient`. Both adapters use `/v1/systemone`.
`apiKey`/`api_key`, `model`, `timeoutMs`/`timeout_ms`, and
`maxConcurrent`/`max_concurrent` configure the same behavior. Defaults are automatic
model routing, 1,000 ms and two concurrent calls. Saturation abstains immediately.

Choice includes the explicit abstention label. Score returns the most probable level
(first on ties), not a rounded expected score. Noul returns a boolean and the probability
of that boolean. Entropy-derived confidence is never used as an answer probability.
Missing answers are absent; malformed batches abstain. Responses cannot introduce new
question ids or labels. Transport failures abstain; Python task cancellation propagates.

Requests are limited to 32 distinct questions and 16,000 UTF-8 state bytes; responses
to 256 KiB. Inputs are never sliced. These transport limits do not enlarge a model's
context window: the deployment must reject inputs beyond its checkpoint's token budget
instead of relying on the upstream server's truncation. Use short, atomic questions.
Authentication is operator-owned; never give a model control of the endpoint or API key.
