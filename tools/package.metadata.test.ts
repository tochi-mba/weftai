import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * What npm shows for a package comes from its package.json and the README and LICENSE inside the
 * tarball, and nothing else. A missing `repository` leaves the page with no link to the source, a
 * LICENSE outside the package folder is not published, and a relative link in a README points
 * nowhere on npm, so each is checked here rather than noticed on the registry after a release.
 */

const ROOT = new URL("../", import.meta.url);
const REPOSITORY = "https://github.com/tochi-mba/weftai";
const PACKAGES = readdirSync(new URL("packages/", ROOT));

function text(path: string): string {
  return readFileSync(new URL(path, ROOT), "utf8");
}

interface Manifest {
  readonly name: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
  readonly homepage?: string;
  readonly repository?: { readonly type: string; readonly url: string; readonly directory: string };
  readonly bugs?: { readonly url: string };
  readonly license?: string;
  readonly files?: readonly string[];
}

describe.each(PACKAGES)("packages/%s", (dir) => {
  const manifest = JSON.parse(text(`packages/${dir}/package.json`)) as Manifest;

  it("links the npm page to its source, its home and its issues", () => {
    expect(manifest.repository).toEqual({
      type: "git",
      url: `git+${REPOSITORY}.git`,
      directory: `packages/${dir}`,
    });
    expect(manifest.homepage).toBe(`${REPOSITORY}/tree/main/packages/${dir}#readme`);
    expect(manifest.bugs).toEqual({ url: `${REPOSITORY}/issues` });
  });

  it("describes itself and says what it is about", () => {
    expect(manifest.description?.length ?? 0).toBeGreaterThan(20);
    expect(manifest.keywords?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(manifest.license).toBe("MIT");
  });

  it("publishes its README and the repository's own LICENSE", () => {
    expect(manifest.files).toEqual(expect.arrayContaining(["dist", "README.md", "LICENSE"]));
    expect(text(`packages/${dir}/LICENSE`)).toBe(text("LICENSE"));
  });

  it("has a README whose links work from the npm page", () => {
    const readme = text(`packages/${dir}/README.md`);
    expect(readme.startsWith(`# ${manifest.name}\n`)).toBe(true);
    const targets = [...readme.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1] ?? "");
    for (const target of targets) {
      expect(target, `${dir}/README.md links to ${target}`).toMatch(/^https:\/\//);
    }
  });
});
