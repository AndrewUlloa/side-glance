import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8").catch(() => "");

test("the Claude hero answers a local follow-up with an honest install handoff", async () => {
  const [page, showcase, terminal] = await Promise.all([
    read("app/page.tsx"),
    read("app/components/TerminalShowcase.tsx"),
    read("app/components/InteractiveClaudeTerminal.tsx"),
  ]);

  assert.match(page, /<TerminalShowcase\s*\/>/u);
  assert.match(
    showcase,
    /<InteractiveClaudeTerminal\s+appearance=\{appearance\}\s+elapsedSeconds=\{activeState\.elapsedSeconds\}\s+phase=\{phase\}\s+scenario=\{activeState\.scenario\}\s+terminalId=\{activeState\.terminalId\}\s*\/>/u
  );
  assert.match(terminal, /^"use client";/u);
  assert.match(terminal, /<form[^>]*onSubmit=/u);
  assert.match(terminal, /name="follow-up"/u);
  assert.match(terminal, /aria-label="Ask Claude to continue"/u);
  assert.match(terminal, /aria-live="polite"/u);
  assert.match(
    terminal,
    /visualForPhase\(phase, elapsedSeconds, appearance\)/u
  );
  assert.match(terminal, /To try Side Glance,/u);
  assert.match(terminal, /install the stable release\./u);
  assert.match(terminal, /scrollTo\([\s\S]*scrollHeight/u);
  assert.match(
    terminal,
    /href="https:\/\/github\.com\/AndrewUlloa\/side-glance#installation-status"/u
  );
  assert.match(terminal, /Prompt text stays in this tab/u);
  assert.match(terminal, /never sent or saved/u);
  assert.doesNotMatch(terminal, /ANIMATION STORYBOARD|const TIMING\s*=/u);
  assert.doesNotMatch(terminal, /I’ll rerun the focused test/u);
  assert.doesNotMatch(terminal, /redirect ownership is still ambiguous/u);
  assert.doesNotMatch(terminal, /setTimeout|clearTimeout/u);
  assert.doesNotMatch(terminal, /\bfetch\s*\(/u);
  assert.doesNotMatch(terminal, /localStorage|sessionStorage/u);
  assert.doesNotMatch(terminal, /repeat:\s*Infinity/u);
});
