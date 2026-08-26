import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8").catch(() => "");

test("each visible terminal moment tells the truth about lifecycle and thermal state", async () => {
  const [showcase, terminal] = await Promise.all([
    read("app/components/TerminalShowcase.tsx"),
    read("app/components/InteractiveClaudeTerminal.tsx"),
  ]);

  for (const moment of [
    "working",
    "waiting",
    "ready-short",
    "ready-long",
    "failed",
  ]) {
    assert.match(showcase, new RegExp(`id: "${moment}"`, "u"));
  }
  assert.match(showcase, /phase:\s*"completed"[\s\S]*elapsedSeconds:\s*18/u);
  assert.match(showcase, /phase:\s*"completed"[\s\S]*elapsedSeconds:\s*1122/u);
  assert.match(showcase, /phase:\s*"failed"/u);
  assert.doesNotMatch(showcase, /phase:\s*"inactive"/u);
  assert.match(showcase, /terminalId:\s*"tmux_05"/u);
  assert.match(showcase, /aria-pressed=\{activeState\.id === state\.id\}/u);
  assert.match(
    showcase,
    /elapsedSeconds=\{activeState\.elapsedSeconds\}[\s\S]*scenario=\{activeState\.scenario\}/u
  );

  assert.match(terminal, /const TERMINAL_SCENARIOS/u);
  assert.match(terminal, /The focused lease tests are running now/u);
  assert.match(terminal, /Which route should win\?/u);
  assert.match(terminal, /all focused adapter tests pass/u);
  assert.match(terminal, /All release checks pass/u);
  assert.match(terminal, /Release verification stopped before completion/u);
  assert.match(terminal, /visualForPhase\(phase, elapsedSeconds\)/u);
  assert.match(terminal, /data-scenario=\{scenario\}/u);
  assert.doesNotMatch(terminal, /<p key=\{action\}>/u);
  assert.match(terminal, /key=\{`\$\{action\}:\$\{detail\}`\}/u);
});
