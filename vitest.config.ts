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
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts"],
    },
  },
});
