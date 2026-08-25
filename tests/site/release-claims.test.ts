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

test("keeps guided setup, notification coverage, and recovery guidance aligned", async () => {
  const [readme, packageReadme, changelog, launch, page, installButton] =
    await Promise.all([
      readFile("README.md", "utf8"),
      readFile("packages/cli/README.md", "utf8"),
      readFile("CHANGELOG.md", "utf8"),
      readFile("LAUNCH.md", "utf8"),
      readFile("app/page.tsx", "utf8"),
      readFile("app/components/InstallButton.tsx", "utf8"),
    ]);
  const documentation = [readme, packageReadme, changelog, launch].join("\n");

  for (const guide of [readme, packageReadme, launch]) {
    assert.match(
      guide,
      /brew install AndrewUlloa\/tap\/side-glance[\s\S]*?side-glance init/u
    );
    assert.match(guide, /npx side-glance@beta init/u);
  }

  for (const guide of [readme, packageReadme]) {
    assert.match(guide, /`side-glance setup`[^\n]*exact alias/u);
    assert.match(guide, /read-only preview/u);
    assert.match(guide, /Up\/Down[^\n]*Space[^\n]*Enter/u);
    assert.match(guide, /SIDE_GLANCE_ACCESSIBLE=1/u);
    assert.match(guide, /Claude[^\n]*attention[^\n]*failure/u);
    assert.match(guide, /Codex and Gemini[^\n]*attention/u);
    assert.match(guide, /OpenCode v1[^\n]*Ready[^\n]*attention[^\n]*failure/u);
    assert.match(guide, /generic wrapper[^\n]*process exit/u);
  }

  assert.match(
    documentation,
    /native notifications are ready[^\n]*defaults off/iu
  );
  assert.match(
    documentation,
    /native notification state is unknown[^\n]*defaults off/iu
  );
  assert.match(documentation, /power loss[^\n]*`SIGKILL`/u);
  assert.match(
    documentation,
    /next `side-glance init` or `side-glance doctor`/u
  );
  assert.match(page, /install with Homebrew and run guided setup/u);
  assert.match(
    installButton,
    /brew install AndrewUlloa\/tap\/side-glance\\nside-glance init/u
  );
});
