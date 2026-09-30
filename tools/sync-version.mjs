// Keeps the core VERSION constant, and the version tools/surface.json records, equal to
// packages/core/package.json after `changeset version`. A test fails when either drifts
// (packages/core/src/index.api.test.ts, tools/surface.parity.test.ts), so this runs as part of
// `pnpm version-packages`, and the Release workflow's "Version packages" pull request is green.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pkgPath = fileURLToPath(new URL("../packages/core/package.json", import.meta.url));
const indexPath = fileURLToPath(new URL("../packages/core/src/index.ts", import.meta.url));
const surfacePath = fileURLToPath(new URL("./surface.json", import.meta.url));

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

const surface = readFileSync(surfacePath, "utf8");
const recorded = surface.replace(/^ {2}"version": "[^"]*",$/m, `  "version": "${version}",`);
if (!recorded.includes(`  "version": "${version}",`)) {
  console.error('Could not find the "version" field in tools/surface.json.');
  process.exit(1);
}
if (recorded !== surface) {
  writeFileSync(surfacePath, recorded);
  console.log(`tools/surface.json synced to ${version}.`);
} else {
  console.log(`tools/surface.json already ${version}.`);
}
