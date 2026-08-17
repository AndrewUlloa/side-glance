import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8").catch(() => "");

test("the lifecycle legend controls the live terminal and hugs its buttons", async () => {
  const [page, showcase, terminal, css] = await Promise.all([
    read("app/page.tsx"),
    read("app/components/TerminalShowcase.tsx"),
    read("app/components/InteractiveClaudeTerminal.tsx"),
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
  assert.match(showcase, /terminalId:\s*"tmux_01"/u);
  assert.match(showcase, /terminalId:\s*"tmux_04"/u);
  assert.doesNotMatch(showcase, /terminalId:\s*"tmux_05"/u);
  assert.match(
    showcase,
    /<InteractiveClaudeTerminal\s+elapsedSeconds=\{activeState\.elapsedSeconds\}\s+phase=\{phase\}\s+scenario=\{activeState\.scenario\}\s+terminalId=\{activeState\.terminalId\}\s*\/>/u
  );
  assert.match(showcase, /<button/u);
  assert.match(showcase, /className="minimal-lifecycle gap-lifecycle-gap"/u);
  assert.match(showcase, /aria-pressed=\{activeState\.id === state\.id\}/u);
  assert.match(showcase, /onClick=\{\(\) => selectState\(index\)\}/u);
  assert.match(showcase, /type="button"/u);
  assert.match(
    showcase,
    /visualForPhase\(state\.phase, state\.elapsedSeconds\)/u
  );
  assert.doesNotMatch(showcase, /install-icon\.svg|from "next\/image"/u);

  assert.match(terminal, /phase\?: PlaygroundPhase/u);
  assert.match(terminal, /terminalId\?: string/u);
  assert.match(terminal, /<span>\{terminalId\}<\/span>/u);
  assert.match(terminal, /visualForPhase\(phase, elapsedSeconds\)/u);
  assert.match(terminal, /data-phase=\{phase\}/u);
  assert.match(terminal, /--terminal-current-wash": `#\$\{visual\.wash\}`/u);

  assert.match(
    css,
    /\.minimal-terminal-showcase figcaption\s*\{[^}]*width:\s*fit-content/u
  );
  assert.match(css, /\.minimal-lifecycle\s*\{[^}]*width:\s*fit-content/u);
  assert.match(css, /\.minimal-lifecycle-button\s*\{[^}]*cursor:\s*pointer/u);
  assert.match(css, /\.minimal-lifecycle-button\[aria-pressed="true"\]/u);
  assert.match(css, /\.minimal-lifecycle-progress\s*\{/u);
  assert.match(css, /\.minimal-lifecycle-progress-value\s*\{/u);
  assert.match(css, /--spacing-lifecycle-gap:\s*4rem/u);
});
