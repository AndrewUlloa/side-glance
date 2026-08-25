import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps public beta, provider, terminal, and domain claims within verified evidence", async () => {
  const [
    readme,
    packageReadme,
    changelog,
    spec,
    protocol,
    launch,
    manifestSource,
  ] = await Promise.all([
    readFile("README.md", "utf8"),
    readFile("packages/cli/README.md", "utf8"),
    readFile("CHANGELOG.md", "utf8"),
    readFile("SPEC.md", "utf8"),
    readFile("docs/adapter-protocol.md", "utf8"),
    readFile("LAUNCH.md", "utf8"),
    readFile("assets/r2-manifest.json", "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource) as { defaultOrigin: string };

  assert.match(
    readme,
    /Prereleases are published on npm's\s+explicit `beta` channel/u
  );
  assert.doesNotMatch(
    readme,
    /currently beta\.1|unpublished source candidate/u
  );
  assert.match(
    packageReadme,
    /confirm the installed build with\s+`side-glance --version`/u
  );
  assert.doesNotMatch(packageReadme, /currently resolves|unreleased beta\.3/u);
  assert.match(readme, /Claude Code and Codex are locally contract-audited/u);
  assert.match(readme, /Gemini, OpenCode v1, and Aider remain experimental/u);
  assert.match(packageReadme, /pre-final/u);
  assert.match(
    spec,
    /Claude is silent, while Codex and Gemini receive `\{\}`/u
  );
  assert.doesNotMatch(
    spec,
    /provider hook stdout remains one valid JSON object/u
  );
  assert.match(protocol, /OpenCode v1/u);
  assert.match(protocol, /no JSON event producer/u);
  assert.match(changelog, /\[0\.1\.0-beta\.3\] — 2026-08-24/u);
  assert.match(
    launch,
    /Custom apex status: not configured; DNS does not resolve/u
  );
  assert.equal(
    manifest.defaultOrigin,
    "https://pub-5e783841ee13416ab2ffa0db4d732b63.r2.dev"
  );
});
