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
    /Custom apex status: aliases are configured in Vercel,[\s\S]{0,80}DNS does not\s+resolve/iu
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
    assert.match(guide, /`side-glance setup`[\s\S]{0,120}exact alias/u);
    assert.match(guide, /read-only (?:review|preview)/u);
    assert.match(guide, /Up\/Down[^\n]*Space[^\n]*Enter/u);
    assert.match(guide, /SIDE_GLANCE_ACCESSIBLE=1/u);
    assert.match(guide, /Claude[^\n]*attention[^\n]*failure/u);
    assert.match(guide, /Codex and Gemini[^\n]*attention/u);
    assert.match(guide, /OpenCode v1[^\n]*Ready[^\n]*attention[^\n]*failure/u);
    assert.match(guide, /generic wrapper[^\n]*process exit/u);
    assert.match(
      guide,
      /Status[\s\S]{0,180}Ready[\s\S]{0,80}green[\s\S]{0,80}Failed[\s\S]{0,80}red/u
    );
    assert.match(guide, /side-glance theme/u);
    assert.match(guide, /newest 12[\s\S]{0,40}completed turns/u);
    assert.match(guide, /known[^\n]*subagent[^\n]*work[^\n]*Ready/iu);
    assert.match(
      guide,
      /Customize[\s\S]{0,100}providers[\s\S]{0,80}notifications[\s\S]{0,80}colors/iu
    );
    assert.match(
      guide,
      /Recommended[\s\S]{0,140}Status[\s\S]{0,80}(?:without|no)[\s\S]{0,80}(?:extra|additional)[\s\S]{0,80}(?:question|prompt)/iu
    );
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

test("documents direct provider launch as the primary local CLI journey", async () => {
  const [readme, packageReadme, protocol, storyboard, playground, terminal] =
    await Promise.all([
      readFile("README.md", "utf8"),
      readFile("packages/cli/README.md", "utf8"),
      readFile("docs/adapter-protocol.md", "utf8"),
      readFile("app/components/TerminalStoryboard.tsx", "utf8"),
      readFile("app/components/SideGlancePlayground.tsx", "utf8"),
      readFile("app/components/InteractiveClaudeTerminal.tsx", "utf8"),
    ]);

  for (const guide of [readme, packageReadme]) {
    assert.match(
      guide,
      /(?:just|normally) (?:run|type) `claude`, `codex`, or the experimental `gemini`/iu
    );
    assert.match(guide, /upgrades?[^.]*do not rewrite[^.]*hooks/iu);
    assert.match(guide, /rerun[^.]*`side-glance init`/iu);
    assert.match(
      guide,
      /process ancestry[\s\S]{0,180}owned character (?:device|TTY)/iu
    );
    assert.match(guide, /supported[\s\S]{0,120}not\s+guaranteed/iu);
    assert.match(
      guide,
      /desktop[\s\S]{0,160}detached[\s\S]{0,160}targetless/iu
    );
    assert.match(guide, /`side-glance run`[\s\S]{0,160}fallback/iu);
  }

  assert.match(
    protocol,
    /process ancestry[\s\S]{0,100}canonical TTY candidate/iu
  );
  assert.match(protocol, /renderer[\s\S]{0,200}verified TTY/iu);
  assert.match(
    protocol,
    /desktop[\s\S]{0,160}detached[\s\S]{0,160}targetless/iu
  );
  assert.match(storyboard, /command:\s*"claude"/u);
  assert.match(storyboard, /command:\s*"codex"/u);
  assert.match(storyboard, /command:\s*"gemini"/u);
  assert.doesNotMatch(
    storyboard,
    /side-glance run -- (?:claude|codex|gemini)/u
  );
  assert.match(playground, /<span>~<\/span> claude/u);
  assert.match(
    terminal,
    /<code>claude<\/code>[\s\S]{0,100}<code>codex<\/code>[\s\S]{0,100}<code>gemini<\/code>[\s\S]{0,100}normally/u
  );
  assert.match(terminal, /<code>side-glance init<\/code>/u);
});

test("keeps shipped beta.7 phase launch records closed after publication", async () => {
  const launchRecords = await Promise.all([
    readFile("docs/launch/phase-18-concise-init-output.md", "utf8"),
    readFile("docs/launch/phase-19-semantic-lifecycle.md", "utf8"),
  ]);

  for (const launchRecord of launchRecords) {
    assert.match(launchRecord, /> Status: shipped in `0\.1\.0-beta\.7`/u);
    assert.doesNotMatch(
      launchRecord,
      /## Candidate behavior|protected release in progress|included in the beta\.7 candidate|The next Side Glance beta|The candidate (?:does|migrates)/u
    );

    const checklist =
      launchRecord.match(/## Public verification checklist([\s\S]*)/u)?.[1] ??
      "";
    assert.notEqual(checklist, "");
    assert.doesNotMatch(checklist, /- \[ \]/u);
  }
});
