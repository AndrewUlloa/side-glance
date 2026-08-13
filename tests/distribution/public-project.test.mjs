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

test("documents only durable installation and truthful pre-release availability", async () => {
  const readme = await text("README.md");
  assert.doesNotMatch(readme, /npm link/u);
  assert.match(readme, /npm install --global terminal-signal@beta/u);
  assert.match(readme, /npm install --global \.\/packages\/cli/u);
  assert.match(readme, /release candidate/iu);

  const packageReadme = await text("packages/cli/README.md");
  assert.match(packageReadme, /Node\.js 22 or newer/u);
  assert.match(packageReadme, /refuses permanent provider installation from `npx`/u);
  assert.match(packageReadme, /Windows and musl\/Alpine are not supported/u);

  const page = await text("app/page.tsx");
  assert.match(page, /release candidate · v0\.1/u);
  assert.match(page, /available after the first verified beta release/u);
  assert.doesNotMatch(page, /public beta/u);

  const releaseGuide = await text("docs/releasing.md");
  assert.match(releaseGuide, /one-time short-lived granular token/u);
  assert.match(releaseGuide, /trusted publishing/u);
  assert.match(releaseGuide, /ad-hoc signed/u);
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
