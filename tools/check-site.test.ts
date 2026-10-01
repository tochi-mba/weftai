import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { check, main } from "./check-site.js";

/** The Pages site is checked before it is published, and the shipped site passes. */
const GOOD = `<!doctype html><html lang="en"><head><title>Thing — REX Technologies</title>
<link rel="stylesheet" href="styles.css"></head>
<body><a href="#top">top</a><main id="top"><img src="mark.svg" alt="">
<a href="https://github.com/tochi-mba/Thing">source</a></main>
<script src="app.js"></script></body></html>
`;

function site(html: string = GOOD, nojekyll = true): string {
  const dir = join(mkdtempSync(join(tmpdir(), "site-")), "site");
  mkdirSync(dir);
  writeFileSync(join(dir, "index.html"), html);
  for (const name of ["styles.css", "app.js", "mark.svg"]) writeFileSync(join(dir, name), "");
  if (nojekyll) writeFileSync(join(dir, ".nojekyll"), "");
  return dir;
}

describe("the site checker", () => {
  it("passes the shipped site", () => {
    expect(check()).toEqual([]);
  });

  it("finds nothing wrong with a sound site", () => {
    expect(check(site(), "Thing")).toEqual([]);
  });

  it("names a missing index as the only problem worth naming", () => {
    const [problem, ...rest] = check(mkdtempSync(join(tmpdir(), "empty-")), "Thing");
    expect(problem).toMatch(/is missing; there is no site to publish\.$/);
    expect(rest).toEqual([]);
  });

  it.each([
    ["<title>Thing", "<title>Other", "the title does not name Thing."],
    ["REX Technologies", "Somebody", "the page does not name REX Technologies."],
    ['href="styles.css"', 'href="missing.css"', "asset 'missing.css' is referenced but missing."],
    ['href="#top"', 'href="#nowhere"', "anchor '#nowhere' points at an id that does not exist."],
    ['<img src="mark.svg" alt="">', '<img src="mark.svg">', "image 'mark.svg' has no alt text."],
    ["source</a>", "source</a> coming soon", "draft text left in the page: 'coming soon'."],
    [
      "github.com/tochi-mba/Thing",
      "github.com/somebody-else/Thing",
      'the page links to GitHub owners other than tochi-mba: ["somebody-else"].',
    ],
  ])("names the problem when %s becomes %s", (before, after, said) => {
    expect(GOOD).toContain(before);
    expect(check(site(GOOD.replace(before, after)), "Thing")).toEqual([`index.html: ${said}`]);
  });

  it("names a site without .nojekyll", () => {
    const [problem] = check(site(GOOD, false), "Thing");
    expect(problem).toMatch(/^site\/\.nojekyll is missing/);
  });

  it("checks every page, not only the index", () => {
    const dir = site();
    writeFileSync(join(dir, "404.html"), GOOD.replace("<title>Thing", "<title>Lost"));
    expect(check(dir, "Thing")).toEqual(["404.html: the title does not name Thing."]);
  });

  it("does not look for remote assets or empty sources on disk", () => {
    const html = GOOD.replace(
      '<link rel="stylesheet" href="styles.css">',
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">' +
        '<link rel="preconnect" href="//fonts.gstatic.com"><img src="" alt="">',
    );
    expect(check(site(html), "Thing")).toEqual([]);
  });

  it("reports, and exits as a gate", () => {
    const said: string[] = [];
    expect(main([site(), "Thing"], (line) => said.push(line))).toBe(0);
    expect(said).toEqual(["site checks passed"]);
    said.length = 0;
    expect(main([mkdtempSync(join(tmpdir(), "empty-")), "Thing"], (line) => said.push(line))).toBe(
      1,
    );
    expect(said[0]).toBe("1 problem(s) with the site:");
    expect(said[1]).toContain("there is no site to publish");
  });

  it("defaults to the shipped site", () => {
    expect(main([], () => undefined)).toBe(0);
  });
});
