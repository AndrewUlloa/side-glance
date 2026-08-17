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
  assert.match(showcase, /useState<PlaygroundPhase>\("failed"\)/u);
  assert.match(showcase, /<InteractiveClaudeTerminal phase=\{phase\}\s*\/>/u);
  assert.match(showcase, /<button/u);
  assert.match(showcase, /className="minimal-lifecycle gap-lifecycle-gap"/u);
  assert.match(showcase, /aria-pressed=\{phase === state\.phase\}/u);
  assert.match(showcase, /onClick=\{\(\) => setPhase\(state\.phase\)\}/u);
  assert.match(showcase, /type="button"/u);
  assert.match(showcase, /visualForPhase\(state\.phase, 60\)/u);

  assert.match(terminal, /phase\?: PlaygroundPhase/u);
  assert.match(terminal, /visualForPhase\(phase, 60\)/u);
  assert.match(terminal, /data-phase=\{phase\}/u);
  assert.match(terminal, /--terminal-current-wash": `#\$\{visual\.wash\}`/u);

  assert.match(
    css,
    /\.minimal-terminal-showcase figcaption\s*\{[^}]*width:\s*fit-content/u
  );
  assert.match(css, /\.minimal-lifecycle\s*\{[^}]*width:\s*fit-content/u);
  assert.match(css, /\.minimal-lifecycle-button\s*\{[^}]*cursor:\s*pointer/u);
  assert.match(css, /\.minimal-lifecycle-button\[aria-pressed="true"\]/u);
  assert.match(css, /--spacing-lifecycle-gap:\s*4rem/u);
});
