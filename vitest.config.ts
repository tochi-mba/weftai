import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against source so packages need no build step first.
    alias: [
      { find: "weftai/adapter", replacement: here("./packages/core/src/adapter/index.ts") },
      { find: /^weftai$/, replacement: here("./packages/core/src/index.ts") },
      { find: "@weftai/mcp", replacement: here("./packages/mcp/src/index.ts") },
      { find: "@weftai/testing", replacement: here("./packages/testing/src/index.ts") },
      { find: "@weftai/cli", replacement: here("./packages/cli/src/index.ts") },
      {
        find: "@weftai/providers/anthropic/tool-runner",
        replacement: here("./packages/providers/src/anthropic/tool-runner.ts"),
      },
      {
        find: "@weftai/providers/anthropic",
        replacement: here("./packages/providers/src/anthropic/index.ts"),
      },
      {
        find: "@weftai/providers/openai",
        replacement: here("./packages/providers/src/openai/index.ts"),
      },
      {
        find: "@weftai/providers/google",
        replacement: here("./packages/providers/src/google/index.ts"),
      },
      {
        find: "@weftai/providers/bedrock",
        replacement: here("./packages/providers/src/bedrock/index.ts"),
      },
      {
        find: "@weftai/providers/ollama",
        replacement: here("./packages/providers/src/ollama/index.ts"),
      },
      {
        find: "@weftai/providers/cohere",
        replacement: here("./packages/providers/src/cohere/index.ts"),
      },
      {
        find: "@weftai/providers/dashscope",
        replacement: here("./packages/providers/src/dashscope/index.ts"),
      },
      {
        find: "@weftai/providers/hunyuan",
        replacement: here("./packages/providers/src/hunyuan/index.ts"),
      },
      {
        find: "@weftai/providers/spark",
        replacement: here("./packages/providers/src/spark/index.ts"),
      },
      {
        find: "@weftai/providers/ai-sdk",
        replacement: here("./packages/providers/src/ai-sdk/index.ts"),
      },
    ],
  },
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "examples/*/src/**/*.test.ts",
      "examples/*/test/**/*.test.ts",
      "tools/**/*.test.ts",
    ],
    coverage: {
      // Istanbul instruments the source; the V8 provider dropped coverage when a module was
      // loaded by several test files and reported executed constructors as uncovered.
      provider: "istanbul",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts"],
      reporter: ["text", "json-summary"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
