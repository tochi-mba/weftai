/**
 * Live check: the supply-chain domain wired to Claude through the beta tool runner. Not run in
 * CI. Needs ANTHROPIC_API_KEY or an `ant auth login` profile.
 */

import Anthropic from "@anthropic-ai/sdk";
import { weftaiTools } from "@weftai/providers/anthropic/tool-runner";
import { createSupplyChainRuntime } from "../../supply-chain/src/domain.js";

const MODEL = "claude-opus-5";

async function main(): Promise<void> {
  const { runtime, ctx } = createSupplyChainRuntime();
  const tools = weftaiTools(runtime, {
    ctx,
    tools: [
      { name: "query_supply_chain", include: (op) => op.effects === "read" },
      { name: "reserve", include: (op) => op.name === "orders.reserve" },
    ],
  });

  const question =
    process.argv.slice(2).join(" ") ||
    "Which components of the Aurora Drone come from Taiwan, and how many voltage regulators does one drone need?";

  const client = new Anthropic();
  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16_000,
    stream: true,
    messages: [{ role: "user", content: question }],
    tools,
  });

  let toolCalls = 0;
  for await (const stream of runner) {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        process.stdout.write(event.delta.text);
      }
      if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        toolCalls += 1;
        process.stderr.write(`\n[tool call ${toolCalls}: ${event.content_block.name}]\n`);
      }
    }
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      process.stderr.write("\nThe model declined this request.\n");
    }
  }
  process.stdout.write(
    `\n\n(${toolCalls} tool call${toolCalls === 1 ? "" : "s"}; reserved: ${ctx.reserved.length})\n`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
