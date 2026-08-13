import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Linear homepage token parity uses the measured font and visual system", async () => {
  const [layout, css] = await Promise.all([
    read("app/layout.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(layout, /import \{ Inter,/u);
  assert.match(layout, /variable:\s*"--font-inter"/u);
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

  assert.match(css, /font-family:\s*var\(--font-inter\)/u);
  assert.match(css, /font-feature-settings:\s*"cv01",\s*"ss03"/u);
  assert.match(css, /font-optical-sizing:\s*auto/u);
  assert.match(css, /--font-monospace:\s*"Berkeley Mono",\s*ui-monospace/u);
});

test("Linear homepage token parity uses the exact fresh-load choreography", async () => {
  const [page, css, orchestrator, tokens, storyboard] = await Promise.all([
    read("app/page.tsx"),
    read("app/globals.css"),
    read("app/components/MotionOrchestrator.tsx"),
    read("app/lib/motion-tokens.ts").catch(() => ""),
    read("app/components/TerminalStoryboard.tsx"),
  ]);

  assert.match(page, /hero-enter-line-1/u);
  assert.match(page, /hero-enter-line-2/u);
  assert.match(page, /hero-enter-description/u);
  assert.match(page, /hero-enter-announcement/u);
  assert.doesNotMatch(page, /data-reveal/u);

  assert.match(css, /animation-duration:\s*1s/u);
  assert.match(css, /animation-timing-function:\s*var\(--hero-copy-ease\)/u);
  assert.match(css, /\.hero-enter-line-1\s*\{[^}]*animation-delay:\s*0\.4s/u);
  assert.match(css, /\.hero-enter-line-2\s*\{[^}]*animation-delay:\s*0\.5s/u);
  assert.match(css, /\.hero-enter-description\s*\{[^}]*animation-delay:\s*0\.6s/u);
  assert.match(css, /filter:\s*blur\(10px\)/u);
  assert.match(css, /transform:\s*translateY\(20%\)/u);
  assert.doesNotMatch(css, /@keyframes\s+(?:terminal-sheen|ambient-drift|ring-breathe|core-glow|rotate-slow)/u);

  assert.match(orchestrator, /window\.location\.hash\.length\s*>\s*1/u);
  assert.match(orchestrator, /addEventListener\("scroll"/u);
  assert.doesNotMatch(orchestrator, /IntersectionObserver/u);

  assert.match(tokens, /copyDuration:\s*1/u);
  assert.match(tokens, /copyEase:\s*\[0\.25,\s*0\.1,\s*0\.25,\s*1\]/u);
  assert.match(tokens, /illustrationDelay:\s*1\.3/u);
  assert.match(tokens, /illustrationDuration:\s*1\.5/u);
  assert.match(tokens, /interactionDuration:\s*0\.16/u);
  assert.match(storyboard, /from\s+"\.\.\/lib\/motion-tokens"/u);
  assert.match(storyboard, /document\.documentElement\.dataset\.heroMotion/u);
});

test("Linear homepage token parity uses the measured responsive hero type", async () => {
  const css = await read("app/globals.css");
  const heroRule = css.match(/\.hero h1\s*\{([\s\S]*?)\}/u)?.[1] ?? "";

  assert.match(heroRule, /font-size:\s*64px/u);
  assert.match(heroRule, /font-weight:\s*var\(--font-weight-medium\)/u);
  assert.match(heroRule, /letter-spacing:\s*-0\.022em/u);
  assert.match(heroRule, /line-height:\s*1/u);
  assert.match(css, /@media \(max-width:\s*1024px\)[\s\S]*?\.hero h1\s*\{[^}]*font-size:\s*56px[^}]*line-height:\s*1\.1/u);
  assert.match(css, /@media \(max-width:\s*640px\)[\s\S]*?\.hero h1\s*\{[^}]*font-size:\s*38px[^}]*line-height:\s*1\.1/u);
});
