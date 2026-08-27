import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(
  new URL("../../app/page.tsx", import.meta.url),
  "utf8"
);
const interactiveTerminalSource = await readFile(
  new URL(
    "../../app/components/InteractiveClaudeTerminal.tsx",
    import.meta.url
  ),
  "utf8"
);
const terminalShowcaseSource = await readFile(
  new URL("../../app/components/TerminalShowcase.tsx", import.meta.url),
  "utf8"
);
const installButtonSource = await readFile(
  new URL("../../app/components/InstallButton.tsx", import.meta.url),
  "utf8"
);
const storyboardSource = await readFile(
  new URL("../../app/components/TerminalStoryboard.tsx", import.meta.url),
  "utf8"
).catch(() => "");
const stylesheet = await readFile(
  new URL("../../app/globals.css", import.meta.url),
  "utf8"
);

test("focused hero shows Claude inside the real Side Glance lifecycle wash", () => {
  assert.match(pageSource, /<TerminalShowcase\s*\/>/);
  assert.match(terminalShowcaseSource, /className="minimal-terminal-surface\b/);
  assert.match(
    terminalShowcaseSource,
    /<InteractiveClaudeTerminal\s+appearance=\{appearance\}\s+elapsedSeconds=\{activeState\.elapsedSeconds\}\s+phase=\{phase\}\s+scenario=\{activeState\.scenario\}\s+terminalId=\{activeState\.terminalId\}\s*\/>/
  );
  assert.match(interactiveTerminalSource, /className="mock-terminal"/);
  assert.match(interactiveTerminalSource, /Interactive Claude session/);
  assert.match(
    interactiveTerminalSource,
    /visualForPhase\(phase, elapsedSeconds, appearance\)/
  );
  assert.match(interactiveTerminalSource, /install the public beta\./);
  assert.doesNotMatch(interactiveTerminalSource, /workingWash/);
  assert.match(interactiveTerminalSource, /className="mock-terminal-wash"/);
  assert.match(interactiveTerminalSource, /Claude Code/);
  assert.match(interactiveTerminalSource, /Opus 5 \(1M context\)/);
  assert.doesNotMatch(interactiveTerminalSource, /mock-terminal-state/);
  assert.doesNotMatch(interactiveTerminalSource, /mock-terminal-footer/);
  assert.doesNotMatch(interactiveTerminalSource, /mock-terminal-failure/);
  assert.match(
    stylesheet,
    /\.mock-terminal-wash\s*\{[\s\S]*background:\s*var\(--terminal-current-wash\)/
  );
  assert.doesNotMatch(pageSource, /src="\/hero-terminal\.png"/);
  assert.doesNotMatch(pageSource, /<TerminalStoryboard\s*\/?>/);
  assert.doesNotMatch(pageSource, /<SideGlancePlayground\s*\/?>/);
});

test("hero stays focused on one headline, one install action, and one product proof", () => {
  assert.match(pageSource, /Long loops\./);
  assert.match(pageSource, /Short glances\./);
  assert.match(pageSource, /<InstallButton/u);
  assert.match(
    installButtonSource,
    /className="minimal-install rounded-header-action text-header-action!"/
  );
  assert.doesNotMatch(pageSource, /Local-first attention layer/);
  assert.doesNotMatch(pageSource, /className="eyebrow/);
  assert.doesNotMatch(pageSource, /className="hero-proof/);
  assert.doesNotMatch(pageSource, /aria-label="Side Glance guarantees"/);
  assert.doesNotMatch(stylesheet, /\.eyebrow/);
  assert.doesNotMatch(stylesheet, /\.hero-proof/);
});

test("storyboard is data-driven, stage-driven, replayable, and finite", () => {
  assert.match(storyboardSource, /ANIMATION STORYBOARD/);
  assert.match(storyboardSource, /const TIMING\s*=/);
  assert.match(storyboardSource, /const TERMINALS\s*=/);
  assert.match(storyboardSource, /const STACK\s*=/);
  assert.match(storyboardSource, /const \[stage, setStage\]\s*=\s*useState/);
  assert.match(storyboardSource, /TERMINALS\.map/);
  assert.match(storyboardSource, /setTimeout/);
  assert.match(storyboardSource, /clearTimeout/);
  assert.match(storyboardSource, /Replay/);
  assert.match(storyboardSource, /from\s+"\.\.\/lib\/motion-tokens"/);
  assert.match(storyboardSource, /DEFAULT_SIDE_GLANCE_THEME/);
  assert.doesNotMatch(storyboardSource, /repeat:\s*Infinity/);
});

test("storyboard renders four lifecycle colors and a reduced-motion final stack", () => {
  for (const phase of ["working", "completed", "waiting", "failed"]) {
    assert.match(storyboardSource, new RegExp(`phase:\\s*["']${phase}["']`));
  }

  assert.match(storyboardSource, /useReducedMotion/);
  assert.match(storyboardSource, /data-layout=\{[^}]*"stack"/);
  assert.match(stylesheet, /\.terminal-storyboard/);
  assert.match(stylesheet, /\.story-terminal/);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/);
});

test("reduced motion preserves server markup through the first hydration render", () => {
  assert.match(
    storyboardSource,
    /const \[hasHydrated, setHasHydrated\]\s*=\s*useState\(false\)/
  );
  assert.match(storyboardSource, /shouldReduceMotion && hasHydrated/);
  assert.match(storyboardSource, /setTimeout\(\(\) => setHasHydrated\(true\)/);
  assert.doesNotMatch(
    storyboardSource,
    /const visibleStage = shouldReduceMotion \? STAGE\.complete : stage/
  );
});

test("focused hero uses responsive Tailwind gutters and the vertical Figma stack", () => {
  const heroRule =
    stylesheet.match(/\.minimal-home\s*\{([\s\S]*?)\}/)?.[1] ?? "";

  assert.match(heroRule, /min-height:\s*100dvh/);
  assert.doesNotMatch(heroRule, /max-width:/);
  assert.match(heroRule, /background:\s*#fff/);
  assert.match(pageSource, /gap-layout-stack px-site-gutter/);
  assert.match(
    stylesheet,
    /--spacing-site-gutter:\s*clamp\(1\.5rem, 7\.937vw, 7\.5rem\)/
  );
  assert.match(heroRule, /overflow-x:\s*clip/);
  assert.match(stylesheet, /\.minimal-hero\s*\{[^}]*flex-direction:\s*column/);
});
