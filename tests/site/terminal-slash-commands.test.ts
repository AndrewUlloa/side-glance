import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8").catch(() => "");

test("the terminal mirrors Cursor's slash menu and keeps model switching local", async () => {
  const terminal = await read("app/components/InteractiveClaudeTerminal.tsx");

  assert.match(terminal, /const SLASH_COMMANDS\s*=/u);
  assert.match(
    terminal,
    /command:\s*"\/model"[\s\S]*description:\s*"switch models"/u
  );
  assert.match(
    terminal,
    /command:\s*"\/reset"[\s\S]*description:\s*"replay demo"/u
  );

  for (const model of [
    "Auto",
    "Grok 4.6",
    "Opus 5",
    "GPT-5.6 Sol High Fast",
    "Fable 5 Max",
    "Gemini 3.1 Pro",
    "Composer 2.5",
  ]) {
    assert.match(
      terminal,
      new RegExp(`label: "${model.replaceAll(".", "\\.")}"`, "u")
    );
  }

  assert.match(terminal, /const DEFAULT_MODEL\s*=\s*"Opus 5"/u);
  assert.match(terminal, /useState<MenuMode>\("commands"\)/u);
  assert.match(terminal, /const \[activeItemIndex, setActiveItemIndex\]/u);
  assert.match(
    terminal,
    /command\.toLowerCase\(\)\.startsWith\(commandQuery\)/u
  );
  assert.doesNotMatch(terminal, /description\.toLowerCase\(\)\.includes/u);
  assert.match(terminal, /event\.key === "ArrowDown"/u);
  assert.match(terminal, /event\.key === "ArrowUp"/u);
  assert.match(terminal, /event\.key === "Escape"/u);
  assert.match(terminal, /role="combobox"/u);
  assert.match(terminal, /role="listbox"/u);
  assert.match(terminal, /role="option"/u);
  assert.doesNotMatch(
    terminal,
    /<form className="mock-claude-composer"[\s\S]*?<button[\s\S]*?<\/form>/u
  );
  assert.match(terminal, /aria-activedescendant=/u);
  assert.match(terminal, /setSelectedModel/u);
  assert.match(terminal, /resetDemo/u);
  assert.match(terminal, /Opus 5 \(1M context\)/u);
  assert.match(terminal, /<span>tmux-01<\/span>/u);
  assert.doesNotMatch(terminal, /\[LW1\]/u);
  assert.doesNotMatch(terminal, /\bfetch\s*\(/u);
  assert.doesNotMatch(terminal, /localStorage|sessionStorage/u);
});
