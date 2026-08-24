import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps public beta, provider, terminal, and domain claims within verified evidence", async () => {
  const [readme, packageReadme, changelog, protocol, launch, manifestSource] =
    await Promise.all([
      readFile("README.md", "utf8"),
      readFile("packages/cli/README.md", "utf8"),
      readFile("CHANGELOG.md", "utf8"),
      readFile("docs/adapter-protocol.md", "utf8"),
      readFile("LAUNCH.md", "utf8"),
      readFile("assets/r2-manifest.json", "utf8"),
    ]);
  const manifest = JSON.parse(manifestSource) as { defaultOrigin: string };

  assert.match(
    readme,
    /npm beta tag currently resolves\s+to `0\.1\.0-beta\.1`/u
  );
  assert.match(readme, /Claude Code and Codex are locally contract-audited/u);
  assert.match(readme, /Gemini, OpenCode v1, and Aider remain experimental/u);
  assert.match(packageReadme, /pre-final/u);
  assert.match(protocol, /OpenCode v1/u);
  assert.match(protocol, /no JSON event producer/u);
  assert.match(changelog, /0\.1\.0-beta\.3 candidate \(unreleased\)/u);
  assert.match(
    launch,
    /Custom apex status: not configured; DNS does not resolve/u
  );
  assert.equal(
    manifest.defaultOrigin,
    "https://pub-5e783841ee13416ab2ffa0db4d732b63.r2.dev"
  );
});
