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
  const hostile = `provider\u001b[31m\u202e\n${"x".repeat(300)}`;
  const sanitized = sanitizePromptText(hostile);

  assert.equal(hasControlCharacter(sanitized), false);
  assert.equal(sanitized.includes("\u202e"), false);
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
  const prompter = createReadlineSetupPrompter({
    environment: { NODE_ENV: "test", TERM: "xterm-256color" },
    input,
    output,
  });
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

test("TTY multiselect moves with arrow keys and toggles with Space", async () => {
  const input = new PassThrough() as PassThrough & {
    isTTY: boolean;
    isRaw: boolean;
    setRawMode(value: boolean): void;
  };
  const output = new PassThrough() as PassThrough & {
    columns: number;
    isTTY: boolean;
  };
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (value) => {
    input.isRaw = value;
  };
  output.isTTY = true;
  output.columns = 80;

  const prompter = createReadlineSetupPrompter({
    environment: { NODE_ENV: "test", TERM: "xterm-256color" },
    input,
    output,
  });
  const pending = prompter.multiselect("Select providers", [
    { id: "claude", label: "Claude Code", selected: true },
    { id: "codex", label: "Codex", selected: false },
  ]);
  input.end("\u001b[B \rnone\r");

  assert.deepEqual(await pending, {
    status: "value",
    value: ["claude", "codex"],
  });
  assert.equal(input.isRaw, false);
  prompter.close();
});

test("TTY single-select moves with arrow keys and submits with Enter", async () => {
  const input = new PassThrough() as PassThrough & {
    isTTY: boolean;
    isRaw: boolean;
    setRawMode(value: boolean): void;
  };
  const output = new PassThrough() as PassThrough & {
    columns: number;
    isTTY: boolean;
  };
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (value) => {
    input.isRaw = value;
  };
  output.isTTY = true;
  output.columns = 80;

  const prompter = createReadlineSetupPrompter({
    environment: { NODE_ENV: "test", TERM: "xterm-256color" },
    input,
    output,
  });
  const pending = (
    prompter as unknown as {
      select(
        message: string,
        choices: readonly { id: string; label: string; selected?: boolean }[],
      ): Promise<unknown>;
    }
  ).select("How would you like to continue?", [
    { id: "recommended", label: "Use recommended settings", selected: true },
    { id: "customize", label: "Customize" },
    { id: "exit", label: "Exit" },
  ]);
  input.end("\u001b[B\r");

  assert.deepEqual(await pending, {
    status: "value",
    value: "customize",
  });
  assert.equal(input.isRaw, false);
  prompter.close();
});

test("TTY prompts skip disabled choices and wrap with arrow keys", async () => {
  const { input, output } = fakeTerminal();
  const prompter = createReadlineSetupPrompter({
    environment: { NODE_ENV: "test", TERM: "xterm-256color" },
    input,
    output,
  });
  const pending = prompter.select("Choose", [
    { id: "recommended", label: "Recommended", selected: true },
    { id: "unavailable", label: "Unavailable", disabled: true },
    { id: "customize", label: "Customize" },
  ]);
  input.end("\u001b[B\u001b[B\r");

  assert.deepEqual(await pending, {
    status: "value",
    value: "recommended",
  });
  assert.equal(input.isRaw, false);
  prompter.close();
});

test("TTY prompts bound every rendered row to the terminal width", async () => {
  const { input, output } = fakeTerminal();
  output.columns = 32;
  let rendered = "";
  output.setEncoding("utf8");
  output.on("data", (chunk: string) => {
    rendered += chunk;
  });
  const prompter = createReadlineSetupPrompter({
    environment: { NODE_ENV: "test", TERM: "xterm-256color" },
    input,
    output,
  });
  const pending = prompter.select("Choose an installation experience", [
    {
      id: "recommended",
      label:
        "Use recommended settings for Claude, Codex, Gemini, and OpenCode",
      selected: true,
    },
  ]);
  input.end("\r");

  assert.equal((await pending).status, "value");
  const visibleRows = rendered
    .replaceAll(
      new RegExp(`${String.fromCodePoint(27)}\\[[0-9;?]*[A-Za-z]`, "gu"),
      "",
    )
    .split("\n")
    .filter((line) => line.length > 0);
  assert.equal(
    visibleRows.every((line) => [...line].length <= output.columns),
    true,
  );
  assert.match(visibleRows.join("\n"), /↑\/↓ move/u);
  assert.match(visibleRows.join("\n"), /Enter select/u);
  assert.match(visibleRows.join("\n"), /❯ ●/u);
  prompter.close();
});

test("TTY prompts treat Ctrl-C as cancellation and restore prior raw state", async () => {
  const { input, output, rawTransitions } = fakeTerminal();
  const prompter = createReadlineSetupPrompter({
    environment: { NODE_ENV: "test", TERM: "xterm-256color" },
    input,
    output,
  });
  const pending = prompter.select("Choose", [
    { id: "recommended", label: "Recommended", selected: true },
    { id: "customize", label: "Customize" },
  ]);
  input.write("\u0003");

  assert.deepEqual(await pending, {
    status: "cancelled",
    reason: "signal",
  });
  assert.deepEqual(rawTransitions, [true, false]);
  assert.equal(input.isRaw, false);
  prompter.close();
});

test("TTY prompts treat Escape as a benign cancellation", async () => {
  const { input, output } = fakeTerminal();
  const prompter = createReadlineSetupPrompter({
    environment: { NODE_ENV: "test", TERM: "xterm-256color" },
    input,
    output,
  });
  const pending = prompter.select("Choose", [
    { id: "recommended", label: "Recommended", selected: true },
  ]);
  input.write("\u001b");

  assert.deepEqual(await pending, {
    status: "cancelled",
    reason: "eof",
  });
  prompter.close();
});

test("TTY prompts settle external aborts and restore raw mode", async () => {
  const controller = new AbortController();
  const { input, output, rawTransitions } = fakeTerminal();
  const prompter = createReadlineSetupPrompter({
    environment: { NODE_ENV: "test", TERM: "xterm-256color" },
    input,
    output,
    signal: controller.signal,
  });
  const pending = prompter.select("Choose", [
    { id: "recommended", label: "Recommended", selected: true },
  ]);
  controller.abort();

  assert.deepEqual(await pending, {
    status: "cancelled",
    reason: "signal",
  });
  assert.deepEqual(rawTransitions, [true, false]);
  assert.equal(input.isRaw, false);
  prompter.close();
});

test("prompt and progress output errors settle without escaping", async () => {
  const { input, output } = fakeTerminal();
  const prompter = createReadlineSetupPrompter({
    environment: { NODE_ENV: "test", TERM: "xterm-256color" },
    input,
    output,
  });
  const pending = prompter.select("Choose", [
    { id: "recommended", label: "Recommended", selected: true },
  ]);
  output.emit("error", new Error("terminal disappeared"));

  assert.deepEqual(await pending, {
    status: "cancelled",
    reason: "signal",
  });
  assert.doesNotThrow(() => {
    prompter.startProgress?.("Writing configuration");
    output.emit("error", new Error("terminal still unavailable"));
    prompter.stopProgress?.("Configuration unavailable", false);
  });
  prompter.close();
});

test("TTY prompts keep the complete remaining lifecycle static after raw mode fails", async () => {
  const { input, output } = fakeTerminal();
  let rendered = "";
  output.setEncoding("utf8");
  output.on("data", (chunk: string) => {
    rendered += chunk;
  });
  input.setRawMode = (value) => {
    if (value) throw new Error("raw mode unavailable");
    input.isRaw = false;
  };
  const prompter = createReadlineSetupPrompter({
    environment: { NODE_ENV: "test", TERM: "xterm-256color" },
    input,
    output,
  });

  const pending = prompter.select("Choose", [
    { id: "recommended", label: "Recommended", selected: true },
  ]);
  input.write("1\n");

  assert.deepEqual(await pending, {
    status: "value",
    value: "recommended",
  });
  const confirmation = prompter.confirm("Apply this plan?", true);
  input.end("\n");
  assert.deepEqual(await confirmation, {
    status: "value",
    value: true,
  });
  prompter.startProgress?.("Writing configuration");
  prompter.stopProgress?.("Provider configuration verified", true);
  prompter.note("Setup complete");
  prompter.close();
  assert.equal(input.listenerCount("keypress"), 0);
  assert.equal(input.listenerCount("end"), 0);
  assert.equal(rendered.includes(String.fromCodePoint(27)), false);
});

test("accessible mode keeps the static prompt without ANSI control bytes", async () => {
  const previousNoColor = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  const { input, output, rawTransitions } = fakeTerminal();
  let rendered = "";
  output.setEncoding("utf8");
  output.on("data", (chunk: string) => {
    rendered += chunk;
  });
  try {
    const prompter = createReadlineSetupPrompter({
      environment: {
        NODE_ENV: "test",
        SIDE_GLANCE_ACCESSIBLE: "1",
        TERM: "xterm-256color",
      },
      input,
      output,
    });
    const pending = prompter.select("Choose", [
      { id: "recommended", label: "Recommended", selected: true },
      { id: "customize", label: "Customize" },
    ]);
    input.end("2\n");

    assert.deepEqual(await pending, {
      status: "value",
      value: "customize",
    });
    assert.equal(rendered.includes(String.fromCodePoint(27)), false);
    assert.deepEqual(rawTransitions, []);
    prompter.close();
  } finally {
    if (previousNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previousNoColor;
  }
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

function fakeTerminal() {
  const rawTransitions: boolean[] = [];
  const input = new PassThrough() as PassThrough & {
    isTTY: boolean;
    isRaw: boolean;
    setRawMode(value: boolean): void;
  };
  const output = new PassThrough() as PassThrough & {
    columns: number;
    isTTY: boolean;
  };
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (value) => {
    rawTransitions.push(value);
    input.isRaw = value;
  };
  output.isTTY = true;
  output.columns = 80;
  return { input, output, rawTransitions };
}
