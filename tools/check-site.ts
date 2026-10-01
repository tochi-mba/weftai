/**
 * Check the GitHub Pages site before it is published.
 *
 * A static site has no compiler, so nothing otherwise catches a broken anchor, a missing asset,
 * an image a screen reader would read out by file name, or draft text that escaped. This is that
 * gate; the Pages workflow runs it on every push, and so does the test suite.
 *
 * Node's standard library only, on purpose: the workflow should not install anything to verify a
 * page that has no build step.
 *
 *   node tools/check-site.ts                  # the site in this repository
 *   node tools/check-site.ts path/to/site Weftai
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SITE = fileURLToPath(new URL("../site", import.meta.url));
export const PRODUCT = "Weftai";
/** Every GitHub link on a REX site points at this owner; anything else is a stale copy. */
export const OWNER = "tochi-mba";

/** Text that means a draft escaped. */
const FORBIDDEN = [
  /\bTODO\b/i,
  /\bFIXME\b/i,
  /\bTBD\b/i,
  /\bLorem ipsum\b/i,
  /\bXXX\b/i,
  /\bcoming soon\b/i,
];
const REMOTE = ["http://", "https://", "data:", "//", "mailto:"];

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match ? (match[2] ?? match[3] ?? "") : undefined;
}

function tags(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) ?? [];
}

function checkPage(dir: string, file: string, product: string): string[] {
  const problems: string[] = [];
  const html = readFileSync(join(dir, file), "utf8");
  const title = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  if (!title.includes(product)) problems.push(`the title does not name ${product}.`);
  if (!html.includes("REX Technologies")) problems.push("the page does not name REX Technologies.");

  const assets: string[] = [];
  for (const tag of tags(html, "img")) assets.push(attribute(tag, "src") ?? "");
  for (const tag of tags(html, "link")) assets.push(attribute(tag, "href") ?? "");
  for (const tag of tags(html, "script")) assets.push(attribute(tag, "src") ?? "");
  for (const asset of assets) {
    if (asset === "" || REMOTE.some((prefix) => asset.startsWith(prefix))) continue;
    if (!existsSync(join(dir, asset.split("?")[0] ?? asset))) {
      problems.push(`asset '${asset}' is referenced but missing.`);
    }
  }

  const ids = new Set<string>();
  for (const match of html.matchAll(/\sid\s*=\s*"([^"]*)"/gi)) ids.add(match[1] ?? "");
  for (const tag of tags(html, "a")) {
    const href = attribute(tag, "href") ?? "";
    if (href.startsWith("#") && href.length > 1 && !ids.has(href.slice(1))) {
      problems.push(`anchor '${href}' points at an id that does not exist.`);
    }
  }
  for (const tag of tags(html, "img")) {
    // An explicitly empty alt marks an image decorative; a missing one does not.
    if (attribute(tag, "alt") === undefined) {
      problems.push(`image '${attribute(tag, "src") || "(no src)"}' has no alt text.`);
    }
  }
  for (const pattern of FORBIDDEN) {
    const match = pattern.exec(html);
    if (match) problems.push(`draft text left in the page: '${match[0]}'.`);
  }
  const owners = new Set<string>();
  for (const match of html.matchAll(/https:\/\/github\.com\/([^/"'\s]+)\//g))
    owners.add(match[1] ?? "");
  owners.delete(OWNER);
  if (owners.size > 0) {
    problems.push(
      `the page links to GitHub owners other than ${OWNER}: ${JSON.stringify([...owners].sort())}.`,
    );
  }
  return problems;
}

/** Every problem with the site. Empty means it is publishable. */
export function check(site: string = SITE, product: string = PRODUCT): string[] {
  if (!existsSync(join(site, "index.html"))) {
    return [`${join(site, "index.html")} is missing; there is no site to publish.`];
  }
  const problems: string[] = [];
  if (!existsSync(join(site, ".nojekyll"))) {
    problems.push(
      "site/.nojekyll is missing: without it Pages runs the site through Jekyll, which drops files beginning with an underscore.",
    );
  }
  const pages = readdirSync(site)
    .filter((name) => name.endsWith(".html"))
    .sort();
  for (const page of pages) {
    for (const problem of checkPage(site, page, product)) problems.push(`${page}: ${problem}`);
  }
  return problems;
}

/** Print every problem and return 1, or say the site passed and return 0. */
export function main(args: readonly string[], print: (line: string) => void = console.log): number {
  const problems = check(args[0] ?? SITE, args[1] ?? PRODUCT);
  if (problems.length > 0) {
    print(`${problems.length} problem(s) with the site:`);
    for (const problem of problems) print(`  - ${problem}`);
    return 1;
  }
  print("site checks passed");
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
