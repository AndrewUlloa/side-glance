import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("the launch page follows the vertical Figma showcase while keeping the terminal live", async () => {
  const [page, showcase, css] = await Promise.all([
    read("app/page.tsx"),
    read("app/components/TerminalShowcase.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(page, /className="minimal-hero gap-layout-stack"/u);
  assert.match(page, /<TerminalShowcase\s*\/>/u);
  assert.match(showcase, /className="minimal-terminal-showcase gap-showcase"/u);
  assert.match(
    showcase,
    /className="minimal-terminal-surface rounded-terminal-stage px-terminal-stage-x py-terminal-stage-y"/u
  );
  assert.match(
    showcase,
    /<InteractiveClaudeTerminal\s+elapsedSeconds=\{activeState\.elapsedSeconds\}\s+phase=\{phase\}\s+scenario=\{activeState\.scenario\}\s+terminalId=\{activeState\.terminalId\}\s*\/>/u
  );
  assert.doesNotMatch(showcase, /hero-terminal\.png/u);

  for (const [id, label] of [
    ["working", "Working"],
    ["waiting", "Waiting"],
    ["ready-short", "Ready · short"],
    ["ready-long", "Ready · long"],
  ]) {
    assert.match(showcase, new RegExp(`id: "${id}"`, "u"));
    assert.match(showcase, new RegExp(`label: "${label}"`, "u"));
  }

  assert.match(showcase, /className="minimal-lifecycle gap-lifecycle-gap"/u);
  assert.match(showcase, /data-state=\{state\.id\}/u);
  assert.match(
    showcase,
    /className="minimal-lifecycle-progress size-lifecycle-icon"/u
  );
  assert.doesNotMatch(showcase, /src="\/install-icon\.svg"/u);

  const expectedTokens = [
    "--spacing-site-gutter: clamp(1.5rem, 7.937vw, 7.5rem)",
    "--spacing-layout-stack: 6rem",
    "--spacing-terminal-stage-x: 8rem",
    "--spacing-terminal-stage-y: 4rem",
    "--spacing-lifecycle-control-height: 2.5rem",
    "--spacing-lifecycle-gap: 4rem",
    "--text-lifecycle: 1.5rem",
    "--radius-terminal-stage: 0.5rem",
  ] as const;

  for (const token of expectedTokens) {
    assert.ok(css.includes(token), `missing Figma layout token: ${token}`);
  }

  assert.match(css, /\.minimal-hero\s*\{[^}]*flex-direction:\s*column/u);
  assert.match(css, /\.minimal-terminal-showcase\s*\{[^}]*width:\s*100%/u);
  assert.match(
    css,
    /@media \(min-width:\s*761px\)[\s\S]*?\.mock-terminal\s*\{[^}]*width:\s*50dvw[^}]*height:\s*50dvh[^}]*max-width:\s*100%/u
  );
  assert.match(
    css,
    /@media \(min-width:\s*761px\)[\s\S]*?\.minimal-terminal-surface\s*\{[^}]*height:\s*calc\(\s*100dvh\s*-\s*var\(--spacing-site-header\)\s*-\s*var\(--spacing-lifecycle-control-height\)\s*-\s*var\(--spacing-showcase\)\s*-\s*var\(--spacing-showcase\)\s*-\s*var\(--spacing-page-block\)\s*\)/u
  );
  assert.match(css, /\.minimal-lifecycle\s*\{[^}]*flex-wrap:\s*wrap/u);
  assert.match(css, /background-image:\s*url\("\/hero-surface\.png"\)/u);

  const headerRule = css.match(/\.minimal-header\s*\{([^}]*)\}/u)?.[1] ?? "";
  assert.match(headerRule, /position:\s*sticky/u);
  assert.match(headerRule, /top:\s*0/u);
  assert.match(headerRule, /z-index:\s*50/u);
  assert.match(headerRule, /backdrop-filter:\s*blur\(16px\)/u);
  assert.match(css, /\.minimal-home\s*\{[^}]*overflow-x:\s*clip/u);
});
