import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  createReadlineSetupPrompter,
  parsePromptSelection,
  sanitizePromptText,
} from "../../src/cli/prompts.ts";

const choices = [
  { id: "claude", label: "Claude Code", selected: true },
  { id: "codex", label: "Codex", selected: true },
  { id: "gemini", label: "Gemini", selected: false },
  { id: "opencode", label: "OpenCode", selected: false, disabled: true },
] as const;

test("parses prompt selections by number or id in canonical choice order", () => {
  assert.deepEqual(parsePromptSelection("", choices), {
    ok: true,
    value: ["claude", "codex"],
  });
  assert.deepEqual(parsePromptSelection("3, 1", choices), {
    ok: true,
    value: ["claude", "gemini"],
  });
  assert.deepEqual(parsePromptSelection("gemini,claude", choices), {
    ok: true,
    value: ["claude", "gemini"],
  });
  assert.deepEqual(parsePromptSelection("none", choices), {
    ok: true,
    value: [],
  });
});

test("rejects duplicate, unknown, and disabled prompt selections", () => {
  for (const input of ["1,claude", "9", "opencode", "4"]) {
    const result = parsePromptSelection(input, choices);
    assert.equal(result.ok, false, input);
    if (!result.ok) assert.match(result.message, /available|duplicate|unavailable/iu);
  }
});

test("sanitizes and bounds prompt-owned text", () => {
  const hostile = `provider\u001b[31m\n${"x".repeat(300)}`;
  const sanitized = sanitizePromptText(hostile);

  assert.equal(hasControlCharacter(sanitized), false);
  assert.ok([...sanitized].length <= 160);
});

test("readline prompter returns defaults and renders static numbered choices", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let rendered = "";
  output.setEncoding("utf8");
  output.on("data", (chunk: string) => {
    rendered += chunk;
  });
  const prompter = createReadlineSetupPrompter({ input, output });
  const pending = prompter.multiselect("Select providers", choices);
  input.end("\n");

  assert.deepEqual(await pending, {
    status: "value",
    value: ["claude", "codex"],
  });
  assert.match(rendered, /1\. \[x\] Claude Code/u);
  assert.match(rendered, /4\. \[-\] OpenCode/u);
  assert.equal(rendered.includes(String.fromCodePoint(27)), false);
  prompter.close();
});

test("readline prompter distinguishes confirmation rejection and EOF", async () => {
  const rejectionInput = new PassThrough();
  const rejectionOutput = new PassThrough();
  const rejecting = createReadlineSetupPrompter({
    input: rejectionInput,
    output: rejectionOutput,
  });
  const rejected = rejecting.confirm("Apply this plan?", true);
  rejectionInput.end("n\n");
  assert.deepEqual(await rejected, { status: "value", value: false });
  rejecting.close();

  const eofInput = new PassThrough();
  const eofOutput = new PassThrough();
  const ending = createReadlineSetupPrompter({ input: eofInput, output: eofOutput });
  const ended = ending.text("Sound", "Glass");
  eofInput.end();
  assert.deepEqual(await ended, { status: "cancelled", reason: "eof" });
  ending.close();
});

test("readline prompter renders validated exact details without truncation", () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let rendered = "";
  output.setEncoding("utf8");
  output.on("data", (chunk: string) => {
    rendered += chunk;
  });
  const prompter = createReadlineSetupPrompter({ input, output });
  const exactPath = `/Users/example/${"nested/".repeat(30)}settings.json`;

  (
    prompter as unknown as { detail(message: string): void }
  ).detail(`Configuration: ${exactPath}`);

  assert.match(rendered, new RegExp(escapeRegExp(exactPath), "u"));
  prompter.close();
});

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || (codePoint >= 127 && codePoint <= 159);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
