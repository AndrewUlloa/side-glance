import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../..", import.meta.url));

test("keeps the v0.1.0 package and stable publication channel synchronized", async () => {
  const manifest = JSON.parse(await text("packages/cli/package.json"));
  const lockfile = JSON.parse(await text("package-lock.json"));
  const changelog = await text("CHANGELOG.md");
  const structuredData = await text("app/lib/structured-data.ts");

  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.publishConfig.tag, "latest");
  assert.equal(lockfile.packages["packages/cli"].version, "0.1.0");
  assert.match(changelog, /## \[0\.1\.0\] — 2026-08-29/u);
  assert.match(
    changelog,
    /^\[Unreleased\]: https:\/\/github\.com\/AndrewUlloa\/side-glance\/compare\/v0\.1\.0\.\.\.HEAD$/mu,
  );
  assert.match(structuredData, /softwareVersion:\s*"0\.1\.0"/u);
});

test("keeps current installation and discovery surfaces on the stable channel", async () => {
  const stableGuides = await Promise.all([
    text("README.md"),
    text("packages/cli/README.md"),
  ]);
  for (const guide of stableGuides) {
    assert.match(guide, /npm install --global side-glance@latest/u);
    assert.match(guide, /npx side-glance@latest init/u);
  }

  const currentSurfaces = await Promise.all([
    ...stableGuides,
    text("public/llms.txt"),
    text("app/components/InteractiveClaudeTerminal.tsx"),
    text("app/components/SiteHeader.tsx"),
    text("app/components/WebMcpTools.tsx"),
    text("app/lib/agent-content.ts"),
    text("app/lib/agent-discovery.ts"),
    text("src/cli/bootstrap-command.ts"),
    text("src/cli/install.ts"),
  ]);
  const combined = currentSurfaces.join("\n");

  assert.doesNotMatch(
    combined,
    /side-glance@beta|public beta|available as a beta package/iu,
  );
  assert.match(combined, /stable · v0\.1/u);
  assert.match(combined, /Gemini, OpenCode v1, and Aider remain experimental/u);
  assert.match(combined, /Intel macOS is experimental/u);
});

async function text(filename) {
  return readFile(path.join(repository, filename), "utf8");
}
