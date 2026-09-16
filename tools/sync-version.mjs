// Keeps the core VERSION constant equal to packages/core/package.json after `changeset version`.
// A test (packages/core/src/index.api.test.ts) fails when they drift, so this runs as part of
// `pnpm version-packages`.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pkgPath = fileURLToPath(new URL("../packages/core/package.json", import.meta.url));
const indexPath = fileURLToPath(new URL("../packages/core/src/index.ts", import.meta.url));

const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));
const source = readFileSync(indexPath, "utf8");
const updated = source.replace(
  /export const VERSION = "[^"]*";/,
  `export const VERSION = "${version}";`,
);

if (!updated.includes(`export const VERSION = "${version}";`)) {
  console.error("Could not find the VERSION constant in packages/core/src/index.ts.");
  process.exit(1);
}
if (updated !== source) {
  writeFileSync(indexPath, updated);
  console.log(`VERSION synced to ${version}.`);
} else {
  console.log(`VERSION already ${version}.`);
}
