import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");
const storyboardSource = await readFile(
  new URL("../../app/components/TerminalStoryboard.tsx", import.meta.url),
  "utf8",
).catch(() => "");
const stylesheet = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");

test("hero tells the four-terminal origin story before the playground", () => {
  assert.match(pageSource, /<TerminalStoryboard\s*\/?>/);
  assert.match(pageSource, /id="playground"[\s\S]*<SignalPlayground\s*\/?>/);
  assert.ok(
    pageSource.indexOf("<TerminalStoryboard") < pageSource.indexOf("<SignalPlayground"),
    "the four-terminal story should precede the interactive playground",
  );
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
