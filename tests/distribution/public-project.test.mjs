import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../..", import.meta.url));

test("contains the public project's security, contribution, support, and governance surface", async () => {
  const required = [
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CHANGELOG.md",
    "CODE_OF_CONDUCT.md",
    "SUPPORT.md",
    ".github/CODEOWNERS",
    ".github/dependabot.yml",
    ".github/ISSUE_TEMPLATE/bug.yml",
    ".github/ISSUE_TEMPLATE/feature.yml",
    ".github/ISSUE_TEMPLATE/config.yml",
    ".github/pull_request_template.md",
    ".github/release.yml",
    "docs/cicd.md",
    "docs/releasing.md",
  ];
  await Promise.all(required.map((filename) => access(path.join(repository, filename))));

  const security = await text("SECURITY.md");
  assert.match(security, /security\/advisories\/new/u);
  assert.match(security, /Do not open a public issue/u);
  const contributing = await text("CONTRIBUTING.md");
  assert.match(contributing, /Node\.js 24\.18\.0/u);
  assert.match(contributing, /temporary home/u);
  assert.match(contributing, /npm run test:coverage/u);
  const dependabot = await text(".github/dependabot.yml");
  assert.match(dependabot, /package-ecosystem: npm/u);
  assert.match(dependabot, /package-ecosystem: github-actions/u);
  assert.match(await text(".github/CODEOWNERS"), /@AndrewUlloa/u);
});

test("documents only durable installation and truthful beta availability", async () => {
  const readme = await text("README.md");
  assert.doesNotMatch(readme, /npm link/u);
  assert.match(readme, /npm install --global side-glance@beta/u);
  assert.match(readme, /brew install AndrewUlloa\/tap\/side-glance/u);
  assert.match(readme, /Intel macOS is experimental/u);
  assert.match(readme, /npm install --global \.\/packages\/cli/u);
  assert.match(readme, /available as a beta package/iu);
  assert.match(readme, /https:\/\/sideglance\.dev/u);
  assert.match(readme, /CLI command[\s\S]{0,200}`PATH`/iu);
  assert.match(readme, /desktop\s+app[\s\S]{0,120}may still be usable/iu);
  assert.match(
    readme,
    /(?:just|normally) (?:run|type) `claude`, `codex`, or the experimental `gemini`/iu,
  );
  assert.match(readme, /`side-glance run`[\s\S]{0,160}fallback/iu);

  const packageReadme = await text("packages/cli/README.md");
  assert.match(packageReadme, /Node\.js 22 or newer/u);
  assert.match(packageReadme, /brew install AndrewUlloa\/tap\/side-glance/u);
  assert.match(packageReadme, /Intel macOS is experimental/u);
  assert.match(packageReadme, /refuses permanent provider installation from `npx`/u);
  assert.match(packageReadme, /Windows and musl\/Alpine are not supported/u);
  assert.match(packageReadme, /CLI command[\s\S]{0,200}`PATH`/iu);
  assert.match(packageReadme, /desktop\s+app[\s\S]{0,120}may still be usable/iu);
  assert.match(
    packageReadme,
    /(?:just|normally) (?:run|type) `claude`, `codex`, or the experimental `gemini`/iu,
  );
  assert.match(packageReadme, /`side-glance run`[\s\S]{0,160}fallback/iu);

  const siteHeader = await text("app/components/SiteHeader.tsx");
  assert.match(siteHeader, /public beta · v0\.1/u);
  assert.match(siteHeader, /install with Homebrew and run guided setup/u);
  assert.doesNotMatch(
    siteHeader,
    /available after the first verified beta release/u
  );

  const releaseGuide = await text("docs/releasing.md");
  assert.match(releaseGuide, /Initial npm ownership is established/u);
  assert.match(releaseGuide, /`AndrewUlloa\/homebrew-tap` is public/u);
  assert.match(releaseGuide, /trusted publishing/u);
  assert.match(releaseGuide, /ad-hoc signed/u);
});

test("publishes one consistent Apache-2.0 license surface", async () => {
  const rootLicense = await text("LICENSE");
  const packageLicense = await text("packages/cli/LICENSE");
  const repositoryManifest = JSON.parse(await text("package.json"));
  const manifest = JSON.parse(await text("packages/cli/package.json"));
  const lockfile = JSON.parse(await text("package-lock.json"));
  const readme = await text("README.md");
  const formulaGenerator = await text("scripts/release/generate-homebrew-formula.mjs");

  assert.equal(packageLicense, rootLicense);
  assert.match(rootLicense, /^\s*Apache License\s+Version 2\.0, January 2004/u);
  assert.match(rootLicense, /Copyright 2026 Andrew Ulloa/u);
  assert.equal(repositoryManifest.license, "Apache-2.0");
  assert.equal(manifest.license, "Apache-2.0");
  assert.equal(lockfile.packages[""].license, "Apache-2.0");
  assert.equal(lockfile.packages["packages/cli"].license, "Apache-2.0");
  assert.match(readme, /## License\s+\n\s*Apache-2\.0/u);
  assert.match(formulaGenerator, /license "Apache-2\.0"/u);
});

test("selected public Markdown documents have no broken relative links", async () => {
  const documents = [
    "README.md",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CHANGELOG.md",
    "SUPPORT.md",
    "LAUNCH.md",
    "REVIEW.md",
    "SPEC.md",
    "docs/cicd.md",
    "docs/releasing.md",
  ];
  for (const document of documents) {
    const contents = await text(document);
    for (const match of contents.matchAll(/\[[^\]]+\]\((\.\.?\/[^)#]+)(?:#[^)]+)?\)/gu)) {
      const target = path.resolve(repository, path.dirname(document), match[1]);
      await assert.doesNotReject(() => access(target), `${document} links to missing ${match[1]}`);
    }
  }
});

async function text(filename) {
  return readFile(path.join(repository, filename), "utf8");
}
