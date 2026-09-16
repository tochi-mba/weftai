# @agentweft/anthropic

Expose an Agentweft runtime to Claude as tools for the Anthropic SDK's beta tool runner.

```ts
import { agentweftTools } from "@agentweft/anthropic";
import Anthropic from "@anthropic-ai/sdk";

const tools = agentweftTools(runtime, {
  ctx,
  session: { id: conversationId },
  tools: [
    { name: "query_diagram", include: (op) => op.effects === "read" },
    { name: "select", include: (op) => op.name === "selection.select" },
  ],
});

const client = new Anthropic();
const runner = client.beta.messages.toolRunner({
  model: "claude-opus-5",
  max_tokens: 16_000,
  tools,
  messages: [{ role: "user", content: "Which of Corporate 1's subsidiaries are in Delaware?" }],
});
```

Each spec becomes one tool whose input is a plan. `include` scopes the operations the tool
advertises and can run; `strict: true` is on by default; `eagerInputStreaming: true` spreads
`eager_input_streaming`. All tools from one call share a session, so a later tool call can
`$ref` an earlier result.

`toToolDefinition(runtime, spec, { ctx, session })` returns `{ name, description, input_schema,
strict, handle }` for a manual tool-use loop.
