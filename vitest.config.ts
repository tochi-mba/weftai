import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against source so packages need no build step first.
    alias: {
      weftai: here("./packages/core/src/index.ts"),
      "@weftai/anthropic": here("./packages/anthropic/src/index.ts"),
      "@weftai/mcp": here("./packages/mcp/src/index.ts"),
      "@weftai/testing": here("./packages/testing/src/index.ts"),
      "@weftai/cli": here("./packages/cli/src/index.ts"),
    },
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
