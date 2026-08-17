import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("homepage token parity uses Alan Sans and the measured visual system", async () => {
  const [layout, css] = await Promise.all([
    read("app/layout.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(layout, /import \{ Alan_Sans,/u);
  assert.match(layout, /variable:\s*"--font-alan-sans"/u);
  assert.doesNotMatch(layout, /\bInter\b/u);
  assert.doesNotMatch(layout, /\bGeist\b/u);

  const exactTokens = [
    "--font-weight-medium: 510",
    "--font-weight-semibold: 590",
    "--font-weight-bold: 680",
    "--color-bg-primary: #08090a",
    "--color-bg-level-1: #0f1011",
    "--color-bg-level-2: #141516",
    "--color-bg-level-3: #191a1b",
    "--color-text-primary: #f7f8f8",
    "--color-text-secondary: #d0d6e0",
    "--color-text-tertiary: #8a8f98",
    "--color-text-quaternary: #62666d",
    "--color-border-primary: #23252a",
    "--color-border-translucent: #ffffff0d",
    "--color-border-translucent-strong: #ffffff14",
    "--radius-4: 4px",
    "--radius-6: 6px",
    "--radius-8: 8px",
    "--radius-12: 12px",
    "--radius-16: 16px",
    "--radius-24: 24px",
    "--radius-32: 32px",
    "--shadow-low: 0 2px 4px #0000001a",
    "--shadow-medium: 0 4px 24px #0003",
    "--shadow-high: 0 7px 32px #00000059",
    "--speed-quick-transition: 0.1s",
    "--speed-regular-transition: 0.25s",
    "--ease-out-quad: cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    "--ease-in-out-quad: cubic-bezier(0.455, 0.03, 0.515, 0.955)",
    "--hero-copy-ease: cubic-bezier(0.25, 0.1, 0.25, 1)",
  ] as const;

  for (const token of exactTokens) {
    assert.ok(css.includes(token), `missing measured token: ${token}`);
  }

  assert.match(css, /font-family:\s*var\(--font-alan-sans\)/u);
  assert.match(css, /letter-spacing:\s*-0\.03rem/u);
  assert.match(css, /font-feature-settings:\s*"cv01",\s*"ss03"/u);
  assert.match(css, /font-optical-sizing:\s*auto/u);
  assert.match(css, /--font-monospace:\s*"Berkeley Mono",\s*ui-monospace/u);
});

test("focused homepage uses the exact static Figma assets and copy", async () => {
  const [page, showcase, terminal, installButton, css] = await Promise.all([
    read("app/page.tsx"),
    read("app/components/TerminalShowcase.tsx"),
    read("app/components/InteractiveClaudeTerminal.tsx"),
    read("app/components/InstallButton.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(
    page,
    /className="minimal-home gap-layout-stack px-site-gutter pb-page-block"/u
  );
  assert.match(page, /Long loops\./u);
  assert.match(page, /Short glances\./u);
  assert.match(page, /Know which loop needs judgment\./u);
  assert.match(page, /Let the others keep running\./u);
  assert.match(page, /src="\/side-glance-mark\.svg"/u);
  assert.match(page, /<InstallButton/u);
  assert.match(installButton, /src="\/install-icon\.svg"/u);
  assert.match(page, /<TerminalShowcase\s*\/>/u);
  assert.match(showcase, /<InteractiveClaudeTerminal phase=\{phase\}\s*\/>/u);
  assert.match(terminal, /className="mock-terminal"/u);
  assert.match(terminal, /Interactive Claude session/u);
  assert.match(terminal, /The redirect behavior is ambiguous/u);
  assert.doesNotMatch(page, /src="\/hero-terminal\.png"/u);
  assert.match(css, /background-image:\s*url\("\/hero-surface\.png"\)/u);
  assert.match(page, /<MotionOrchestrator\s*\/>/u);
  assert.doesNotMatch(page, /TerminalStoryboard/u);
  assert.doesNotMatch(page, /SideGlancePlayground/u);
});

test("focused homepage uses the measured responsive hero type", async () => {
  const css = await read("app/globals.css");
  const heroRule = css.match(/\.minimal-copy h1\s*\{([\s\S]*?)\}/u)?.[1] ?? "";

  assert.match(heroRule, /font-size:\s*72px/u);
  assert.match(heroRule, /letter-spacing:\s*-2\.16px/u);
  assert.match(heroRule, /line-height:\s*1\.08/u);
  assert.match(
    css,
    /@media \(max-width:\s*760px\)[\s\S]*?\.minimal-copy h1\s*\{[^}]*font-size:\s*clamp\(48px, 14vw, 64px\)[^}]*line-height:\s*1\.02/u
  );
});
