import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8").catch(() => "");

test("the lifecycle legend controls the live terminal and hugs its buttons", async () => {
  const [page, showcase, terminal, playground, css] = await Promise.all([
    read("app/page.tsx"),
    read("app/components/TerminalShowcase.tsx"),
    read("app/components/InteractiveClaudeTerminal.tsx"),
    read("app/components/SideGlancePlayground.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(page, /<TerminalShowcase\s*\/>/u);
  assert.match(showcase, /^"use client";/u);
  assert.match(showcase, /ANIMATION STORYBOARD/u);
  assert.match(showcase, /const TIMING\s*=/u);
  assert.match(showcase, /startPlayback:\s*2500/u);
  assert.match(showcase, /advanceState:\s*4000/u);
  assert.match(showcase, /const PROGRESS_RING\s*=/u);
  assert.match(
    showcase,
    /const \[stage, setStage\]\s*=\s*useState<number>\(STORYBOARD_STAGE\.waiting\)/u
  );
  assert.match(showcase, /useReducedMotion/u);
  assert.match(showcase, /side-glance:loading-complete/u);
  assert.match(showcase, /setTimeout/u);
  assert.match(showcase, /clearTimeout/u);
  assert.match(showcase, /motion\.circle/u);
  assert.match(showcase, /pathLength/u);
  assert.match(showcase, /const phase = activeState\.phase/u);
  assert.match(
    showcase,
    /const \[appearance, setAppearance\]\s*=\s*useState<PlaygroundAppearance>\("status"\)/u
  );
  assert.match(showcase, /terminalId:\s*"tmux_01"/u);
  assert.match(showcase, /terminalId:\s*"tmux_04"/u);
  assert.match(showcase, /terminalId:\s*"tmux_05"/u);
  assert.match(
    showcase,
    /<InteractiveClaudeTerminal\s+appearance=\{appearance\}\s+elapsedSeconds=\{activeState\.elapsedSeconds\}\s+phase=\{phase\}\s+scenario=\{activeState\.scenario\}\s+terminalId=\{activeState\.terminalId\}\s*\/>/u
  );
  assert.match(showcase, /<button/u);
  assert.match(showcase, />\s*How should finished work look\?\s*</u);
  assert.match(showcase, />\s*Finished work\s*</u);
  assert.match(showcase, />\s*Preview a moment\s*</u);
  assert.match(
    showcase,
    /<legend className="sr-only">\s*How should finished work look\?\s*<\/legend>/u
  );
  assert.match(
    showcase,
    /aria-describedby="side-glance-appearance-explanation"/u
  );
  assert.doesNotMatch(showcase, />\s*Color model\s*</u);
  assert.match(showcase, /aria-pressed=\{appearance === "status"\}/u);
  assert.match(showcase, /aria-pressed=\{appearance === "heat"\}/u);
  assert.match(showcase, /onClick=\{\(\) => selectAppearance\("status"\)\}/u);
  assert.match(showcase, /onClick=\{\(\) => selectAppearance\("heat"\)\}/u);
  assert.match(showcase, />\s*Status\s*</u);
  assert.match(showcase, />\s*Heat\s*</u);
  assert.match(
    showcase,
    /const selectAppearance = \(nextAppearance: PlaygroundAppearance\) => \{[\s\S]*setPlaybackPaused\(true\);[\s\S]*setStage\(INITIAL_STATE_INDEX\);[\s\S]*setAppearance\(nextAppearance\);[\s\S]*\};/u
  );
  assert.match(showcase, /className="minimal-lifecycle"/u);
  assert.match(showcase, /aria-pressed=\{activeState\.id === state\.id\}/u);
  assert.match(showcase, /onClick=\{\(\) => selectState\(index\)\}/u);
  assert.match(
    showcase,
    /const \[isPlaybackPaused, setPlaybackPaused\]\s*=\s*useState\(false\)/u
  );
  assert.match(showcase, /setPlaybackPaused\(true\)/u);
  assert.match(
    showcase,
    /stage === STORYBOARD_STAGE\.waiting \|\|[\s\S]*isPlaybackPaused \|\|[\s\S]*shouldReduceMotion/u
  );
  assert.match(showcase, /type="button"/u);
  assert.match(
    showcase,
    /visualForPhase\([\s\S]*state\.phase,[\s\S]*state\.elapsedSeconds,[\s\S]*appearance[\s\S]*\)/u
  );
  assert.doesNotMatch(showcase, /install-icon\.svg|from "next\/image"/u);
  assert.match(
    showcase,
    /Status keeps Ready green\. Heat warms successful Ready as runtime\s*grows;\s*failure is red immediately in both\./u
  );
  assert.match(
    showcase,
    /aria-live=\{isPlaybackRunning \? "off" : "polite"\}/u
  );

  assert.match(terminal, /phase\?: PlaygroundPhase/u);
  assert.match(terminal, /terminalId\?: string/u);
  assert.match(terminal, /<span>\{terminalId\}<\/span>/u);
  assert.match(
    terminal,
    /visualForPhase\(phase, elapsedSeconds, appearance\)/u
  );
  assert.match(terminal, /data-phase=\{phase\}/u);
  assert.match(terminal, /--terminal-current-wash": `#\$\{visual\.wash\}`/u);

  assert.match(playground, />Turn ran</u);
  assert.doesNotMatch(playground, />Ready for</u);
  assert.doesNotMatch(playground, /% heat/u);

  assert.match(
    css,
    /\.minimal-terminal-showcase figcaption\s*\{[^}]*width:\s*fit-content/u
  );
  assert.match(css, /\.minimal-lifecycle\s*\{[^}]*width:\s*fit-content/u);
  assert.match(css, /\.minimal-lifecycle-button\s*\{[^}]*cursor:\s*pointer/u);
  assert.match(css, /\.minimal-lifecycle-button\[aria-pressed="true"\]/u);
  assert.match(css, /\.minimal-theme-toggle\s*\{/u);
  assert.match(css, /\.minimal-preview-control-label\s*\{/u);
  assert.match(css, /\.minimal-lifecycle-picker\s*\{/u);
  assert.doesNotMatch(css, /\.minimal-theme-toggle-detail/u);
  assert.match(
    css,
    /\.minimal-lifecycle-controls\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center/u
  );
  assert.match(
    css,
    /\.minimal-theme-toggle-button\s*\{[^}]*min-height:\s*30px/u
  );
  assert.match(css, /--spacing-lifecycle-control-height:\s*2\.5rem/u);
  assert.match(
    css,
    /@media \(min-width:\s*761px\)[\s\S]*?\.minimal-lifecycle-controls\s*\{[^}]*flex-wrap:\s*nowrap/u
  );
  assert.match(css, /\.minimal-theme-toggle-button\[aria-pressed="true"\]/u);
  assert.match(css, /\.minimal-lifecycle-progress\s*\{/u);
  assert.match(css, /\.minimal-lifecycle-progress-value\s*\{/u);
  assert.match(css, /\.minimal-lifecycle-explanation\s*\{/u);
  assert.match(css, /--spacing-lifecycle-gap:\s*4rem/u);
});
