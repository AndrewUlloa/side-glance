import {
  createInterface,
  emitKeypressEvents,
  type Interface,
  type Key,
} from "node:readline";

const MAX_PROMPT_TEXT_CODE_POINTS = 160;

export interface PromptChoice {
  id: string;
  label: string;
  selected?: boolean;
  disabled?: boolean;
}

export type PromptOutcome<T> =
  | { status: "value"; value: T }
  | { status: "cancelled"; reason: "eof" | "signal" };

export type PromptSelectionResult =
  | { ok: true; value: string[] }
  | { ok: false; message: string };

export interface SetupPrompter {
  select(
    message: string,
    choices: readonly PromptChoice[],
  ): Promise<PromptOutcome<string>>;
  multiselect(
    message: string,
    choices: readonly PromptChoice[],
  ): Promise<PromptOutcome<string[]>>;
  confirm(message: string, initial: boolean): Promise<PromptOutcome<boolean>>;
  text(message: string, initial: string): Promise<PromptOutcome<string>>;
  note(message: string): void;
  detail?(message: string): void;
  startProgress?(message: string): void;
  stopProgress?(message: string, success: boolean): void;
  close(): void;
}

export function parsePromptSelection(
  input: string,
  choices: readonly PromptChoice[],
): PromptSelectionResult {
  const normalized = input.normalize("NFC").trim();
  if (normalized.length === 0) {
    return {
      ok: true,
      value: choices
        .filter((choice) => choice.selected && !choice.disabled)
        .map(({ id }) => id),
    };
  }
  if (normalized.toLowerCase() === "none") {
    return { ok: true, value: [] };
  }

  const selected = new Set<string>();
  const tokens = normalized.split(",").map((token) => token.trim());
  if (tokens.some((token) => token.length === 0)) {
    return { ok: false, message: "Choose available numbers or names." };
  }
  for (const token of tokens) {
    const numeric = /^\d+$/u.test(token) ? Number.parseInt(token, 10) : undefined;
    const choice =
      numeric === undefined
        ? choices.find(({ id }) => id.toLowerCase() === token.toLowerCase())
        : choices[numeric - 1];
    if (!choice) {
      return { ok: false, message: "Choose available numbers or names." };
    }
    if (choice.disabled) {
      return { ok: false, message: "That choice is unavailable." };
    }
    if (selected.has(choice.id)) {
      return { ok: false, message: "Remove the duplicate choice." };
    }
    selected.add(choice.id);
  }

  return {
    ok: true,
    value: choices.filter(({ id }) => selected.has(id)).map(({ id }) => id),
  };
}

export function sanitizePromptText(value: string): string {
  const normalized = value
    .normalize("NFC")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\p{Bidi_Control}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  const codePoints = [...normalized];
  if (codePoints.length <= MAX_PROMPT_TEXT_CODE_POINTS) return normalized;
  return `${codePoints.slice(0, MAX_PROMPT_TEXT_CODE_POINTS - 1).join("")}…`;
}

export function sanitizePromptDetail(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\p{Bidi_Control}/gu, "");
}

interface SetupPrompterOptions {
  environment?: NodeJS.ProcessEnv;
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  signal?: AbortSignal;
}

export function createReadlineSetupPrompter(
  options: SetupPrompterOptions,
): SetupPrompter {
  if (
    supportsEnhancedPrompts(
      options.input,
      options.output,
      options.environment ?? process.env,
    )
  ) {
    return new KeypressSetupPrompter(options);
  }
  return new ReadlineSetupPrompter(options);
}

interface RawModeInput extends NodeJS.ReadableStream {
  isRaw?: boolean;
  isTTY?: boolean;
  readonly readableFlowing: boolean | null;
  pause(): this;
  resume(): this;
  setRawMode(value: boolean): this | void;
}

interface TerminalOutput extends NodeJS.WritableStream {
  columns?: number;
  isTTY?: boolean;
}

function supportsEnhancedPrompts(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
  environment: NodeJS.ProcessEnv,
): input is RawModeInput {
  const terminalInput = input as Partial<RawModeInput>;
  const terminalOutput = output as Partial<TerminalOutput>;
  return Boolean(
    terminalInput.isTTY &&
      terminalOutput.isTTY &&
      typeof terminalInput.setRawMode === "function" &&
      environment.NO_COLOR === undefined &&
      environment.TERM !== "dumb" &&
      environment.SIDE_GLANCE_ACCESSIBLE !== "1",
  );
}

class KeypressSetupPrompter implements SetupPrompter {
  private readonly options: SetupPrompterOptions;
  private readonly input: RawModeInput;
  private readonly output: NodeJS.WritableStream;
  private readonly signal?: AbortSignal;
  private cancelActive?: () => void;
  private closed = false;
  private fallback?: ReadlineSetupPrompter;
  private progressTimer?: ReturnType<typeof setInterval>;
  private progressFrame = 0;
  private outputFailed = false;
  private readonly handleOutputError = () => {
    this.outputFailed = true;
    this.clearProgress();
    this.cancelActive?.();
  };

  constructor(options: SetupPrompterOptions) {
    this.options = options;
    this.input = options.input as RawModeInput;
    this.output = options.output;
    this.signal = options.signal;
    this.output.on("error", this.handleOutputError);
    emitKeypressEvents(this.input as NodeJS.ReadStream);
  }

  async select(
    message: string,
    choices: readonly PromptChoice[],
  ): Promise<PromptOutcome<string>> {
    if (this.fallback) return await this.fallback.select(message, choices);
    let cursor = initialChoice(choices);
    const outcome = await this.readKeys<string>(
      () => renderSelect(message, choices, cursor),
      (_character, key, finish, redraw) => {
        if (isSignalKey(key)) {
          finish({ status: "cancelled", reason: "signal" });
          return;
        }
        if (isEofKey(key)) {
          finish({ status: "cancelled", reason: "eof" });
          return;
        }
        if (key.name === "up" || key.name === "down") {
          cursor = moveChoiceCursor(
            choices,
            cursor,
            key.name === "up" ? -1 : 1,
          );
          redraw();
          return;
        }
        if (key.name === "return" || key.name === "enter") {
          const choice = choices[cursor];
          if (choice && !choice.disabled) {
            finish({ status: "value", value: choice.id });
          }
        }
      },
    );
    return outcome.status === "fallback"
      ? await this.staticFallback().select(message, choices)
      : outcome;
  }

  async multiselect(
    message: string,
    choices: readonly PromptChoice[],
  ): Promise<PromptOutcome<string[]>> {
    if (this.fallback) return await this.fallback.multiselect(message, choices);
    const selected = new Set(
      choices
        .filter((choice) => choice.selected && !choice.disabled)
        .map(({ id }) => id),
    );
    let cursor = firstEnabledChoice(choices);
    const outcome = await this.readKeys<string[]>(
      () => renderMultiselect(message, choices, selected, cursor),
      (_character, key, finish, redraw) => {
        if (isSignalKey(key)) {
          finish({ status: "cancelled", reason: "signal" });
          return;
        }
        if (isEofKey(key)) {
          finish({ status: "cancelled", reason: "eof" });
          return;
        }
        if (key.name === "up" || key.name === "down") {
          cursor = moveChoiceCursor(
            choices,
            cursor,
            key.name === "up" ? -1 : 1,
          );
          redraw();
          return;
        }
        if (key.name === "space") {
          const choice = choices[cursor];
          if (!choice || choice.disabled) return;
          if (selected.has(choice.id)) selected.delete(choice.id);
          else selected.add(choice.id);
          redraw();
          return;
        }
        if (key.name === "return" || key.name === "enter") {
          finish({
            status: "value",
            value: choices
              .filter(({ id, disabled }) => !disabled && selected.has(id))
              .map(({ id }) => id),
          });
        }
      },
    );
    return outcome.status === "fallback"
      ? await this.staticFallback().multiselect(message, choices)
      : outcome;
  }

  async confirm(
    message: string,
    initial: boolean,
  ): Promise<PromptOutcome<boolean>> {
    if (this.fallback) return await this.fallback.confirm(message, initial);
    return await this.askCooked<boolean>(
      `${sanitizePromptText(message)} ${initial ? "[Y/n]" : "[y/N]"} `,
      (answer) => {
        const normalized = answer.normalize("NFC").trim().toLowerCase();
        if (normalized.length === 0) return { done: true, value: initial };
        if (normalized === "y" || normalized === "yes") {
          return { done: true, value: true };
        }
        if (normalized === "n" || normalized === "no") {
          return { done: true, value: false };
        }
        return { done: false };
      },
    );
  }

  async text(
    message: string,
    initial: string,
  ): Promise<PromptOutcome<string>> {
    if (this.fallback) return await this.fallback.text(message, initial);
    return await this.askCooked(
      `${sanitizePromptText(message)} [${sanitizePromptText(initial)}] `,
      (answer) => ({
        done: true,
        value: answer.normalize("NFC").trim() || initial,
      }),
    );
  }

  note(message: string): void {
    if (this.fallback) {
      this.fallback.note(message);
      return;
    }
    this.write(`${sanitizePromptText(message)}\n`);
  }

  detail(message: string): void {
    if (this.fallback) {
      this.fallback.detail(message);
      return;
    }
    this.write(`${sanitizePromptDetail(message)}\n`);
  }

  startProgress(message: string): void {
    if (this.fallback) {
      this.fallback.startProgress(message);
      return;
    }
    const frames = ["◐", "◓", "◑", "◒"] as const;
    const safeMessage = sanitizePromptText(message);
    const render = () => {
      const frame = frames[this.progressFrame % frames.length];
      this.progressFrame += 1;
      this.write(`\r\u001b[2K${frame} ${safeMessage}`);
    };
    this.clearProgress();
    this.write("\u001b[?25l");
    render();
    this.progressTimer = setInterval(render, 80);
    this.progressTimer.unref();
  }

  stopProgress(message: string, success: boolean): void {
    if (this.fallback) {
      this.fallback.stopProgress(message, success);
      return;
    }
    if (!this.progressTimer) return;
    this.clearProgress();
    this.write(
      `\r\u001b[2K${success ? "✔" : "✖"} ${sanitizePromptText(message)}\n\u001b[?25h`,
    );
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.cancelActive?.();
    this.clearProgress();
    if (this.fallback) this.fallback.close();
    else this.write("\u001b[?25h");
    this.output.removeListener("error", this.handleOutputError);
  }

  private clearProgress(): void {
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = undefined;
    this.progressFrame = 0;
  }

  private staticFallback(): ReadlineSetupPrompter {
    this.fallback ??= new ReadlineSetupPrompter(this.options);
    return this.fallback;
  }

  private write(value: string): void {
    if (this.outputFailed) return;
    try {
      this.output.write(value);
    } catch {
      this.handleOutputError();
    }
  }

  private readKeys<T>(
    frame: () => string[],
    onKey: (
      character: string,
      key: Key,
      finish: (outcome: PromptOutcome<T>) => void,
      redraw: () => void,
    ) => void,
  ): Promise<PromptOutcome<T> | { status: "fallback" }> {
    return new Promise((resolve) => {
      const previousRaw = this.input.isRaw === true;
      const wasFlowing = this.input.readableFlowing === true;
      let renderedLines = 0;
      let settled = false;
      let cursorHidden = false;
      let rawModeStarted = false;
      const redraw = () => {
        const terminalColumns = (this.output as TerminalOutput).columns;
        const width =
          Number.isSafeInteger(terminalColumns) && (terminalColumns ?? 0) > 0
            ? (terminalColumns as number)
            : 80;
        const lines = frame().map((line) => truncateTerminalRow(line, width));
        if (renderedLines > 0) {
          this.write(`\u001b[${renderedLines}A`);
        }
        for (const line of lines) {
          this.write(`\r\u001b[2K${line}\n`);
        }
        renderedLines = lines.length;
      };
      const cleanup = () => {
        this.input.removeListener("keypress", handleKeypress);
        this.input.removeListener("end", handleEnd);
        this.input.removeListener("error", handleError);
        this.input.removeListener("close", handleEnd);
        this.signal?.removeEventListener("abort", handleAbort);
        if (cursorHidden) {
          try {
            this.write("\u001b[?25h");
          } catch {
            // The output stream is already unavailable; input still needs cleanup.
          }
        }
        if (rawModeStarted) {
          try {
            this.input.setRawMode(previousRaw);
          } catch {
            // The input stream may already be unavailable.
          }
        }
        try {
          if (!wasFlowing) this.input.pause();
        } catch {
          // A closing stream may reject flow-state restoration.
        }
        this.cancelActive = undefined;
      };
      const finish = (
        outcome: PromptOutcome<T> | { status: "fallback" },
      ) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(outcome);
      };
      const handleKeypress = (character: string, key: Key) => {
        try {
          onKey(character, key, finish, redraw);
        } catch {
          finish({ status: "cancelled", reason: "eof" });
        }
      };
      const handleEnd = () =>
        finish({ status: "cancelled", reason: "eof" });
      const handleError = () =>
        finish({ status: "cancelled", reason: "eof" });
      const handleAbort = () =>
        finish({ status: "cancelled", reason: "signal" });
      this.cancelActive = () =>
        finish({ status: "cancelled", reason: "signal" });
      this.input.on("keypress", handleKeypress);
      this.input.once("end", handleEnd);
      this.input.once("error", handleError);
      this.input.once("close", handleEnd);
      this.signal?.addEventListener("abort", handleAbort, { once: true });
      if (this.signal?.aborted) {
        handleAbort();
        return;
      }
      try {
        this.input.setRawMode(true);
        rawModeStarted = true;
      } catch {
        finish({ status: "fallback" });
        return;
      }
      try {
        this.input.resume();
        this.write("\u001b[?25l");
        cursorHidden = true;
        redraw();
      } catch {
        finish({ status: "cancelled", reason: "eof" });
      }
    });
  }

  private async askCooked<T>(
    prompt: string,
    parse: (answer: string) => { done: true; value: T } | { done: false },
  ): Promise<PromptOutcome<T>> {
    while (true) {
      const outcome = await askOnce(
        this.input,
        this.output,
        prompt,
        this.signal,
      );
      if (outcome.status === "cancelled") return outcome;
      const parsed = parse(outcome.value);
      if (parsed.done) return { status: "value", value: parsed.value };
      this.write("  Enter yes or no.\n");
    }
  }
}

function firstEnabledChoice(choices: readonly PromptChoice[]): number {
  const index = choices.findIndex(({ disabled }) => !disabled);
  return index < 0 ? 0 : index;
}

function initialChoice(choices: readonly PromptChoice[]): number {
  const selected = choices.findIndex(
    ({ disabled, selected }) => selected && !disabled,
  );
  return selected < 0 ? firstEnabledChoice(choices) : selected;
}

function moveChoiceCursor(
  choices: readonly PromptChoice[],
  cursor: number,
  direction: -1 | 1,
): number {
  if (choices.length === 0) return 0;
  let next = cursor;
  for (let attempts = 0; attempts < choices.length; attempts += 1) {
    next = (next + direction + choices.length) % choices.length;
    if (!choices[next]?.disabled) return next;
  }
  return cursor;
}

function renderMultiselect(
  message: string,
  choices: readonly PromptChoice[],
  selected: ReadonlySet<string>,
  cursor: number,
): string[] {
  return [
    sanitizePromptText(message),
    "↑/↓ move · Space toggle",
    "Enter continue",
    ...choices.map((choice, index) => {
      const pointer = index === cursor && !choice.disabled ? "❯" : " ";
      const marker = choice.disabled
        ? "−"
        : selected.has(choice.id)
          ? "◼"
          : "◻";
      return `${pointer} ${marker} ${sanitizePromptText(choice.label)}`;
    }),
  ];
}

function renderSelect(
  message: string,
  choices: readonly PromptChoice[],
  cursor: number,
): string[] {
  return [
    sanitizePromptText(message),
    "↑/↓ move · Enter select",
    ...choices.map((choice, index) => {
      const pointer = index === cursor && !choice.disabled ? "❯" : " ";
      const marker = choice.disabled ? "−" : index === cursor ? "●" : "○";
      return `${pointer} ${marker} ${sanitizePromptText(choice.label)}`;
    }),
  ];
}

function truncateTerminalRow(value: string, columns: number): string {
  if (terminalCellWidth(value) <= columns) return value;
  const ellipsis = "…";
  const available = Math.max(0, columns - terminalCellWidth(ellipsis));
  let width = 0;
  let result = "";
  for (const character of value) {
    const characterWidth = terminalCellWidth(character);
    if (width + characterWidth > available) break;
    result += character;
    width += characterWidth;
  }
  return `${result}${ellipsis}`;
}

function terminalCellWidth(value: string): number {
  let width = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    width += codePoint <= 0x7f ? 1 : 2;
  }
  return width;
}

function isSignalKey(key: Key): boolean {
  return key.ctrl === true && key.name === "c";
}

function isEofKey(key: Key): boolean {
  return (key.ctrl === true && key.name === "d") || key.name === "escape";
}

function askOnce(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
  prompt: string,
  signal?: AbortSignal,
): Promise<PromptOutcome<string>> {
  return new Promise((resolve) => {
    const readline = createInterface({ input, output, terminal: true });
    let settled = false;
    const finish = (outcome: PromptOutcome<string>) => {
      if (settled) return;
      settled = true;
      readline.removeListener("close", onClose);
      readline.removeListener("SIGINT", onSignal);
      output.removeListener("error", onOutputError);
      signal?.removeEventListener("abort", onSignal);
      readline.close();
      resolve(outcome);
    };
    const onClose = () => finish({ status: "cancelled", reason: "eof" });
    const onSignal = () => finish({ status: "cancelled", reason: "signal" });
    const onOutputError = () =>
      finish({ status: "cancelled", reason: "eof" });
    readline.once("close", onClose);
    readline.once("SIGINT", onSignal);
    output.once("error", onOutputError);
    signal?.addEventListener("abort", onSignal, { once: true });
    if (signal?.aborted) {
      onSignal();
      return;
    }
    readline.question(prompt, (answer) =>
      finish({ status: "value", value: answer }),
    );
  });
}

class ReadlineSetupPrompter implements SetupPrompter {
  private readonly readline: Interface;
  private readonly output: NodeJS.WritableStream;
  private readonly signal?: AbortSignal;
  private cancelActive?: () => void;
  private outputFailed = false;
  private readonly handleOutputError = () => {
    this.outputFailed = true;
    this.cancelActive?.();
  };

  constructor(options: SetupPrompterOptions) {
    this.output = options.output;
    this.signal = options.signal;
    this.output.on("error", this.handleOutputError);
    this.readline = createInterface({
      input: options.input,
      output: options.output,
      terminal: false,
    });
  }

  async select(
    message: string,
    choices: readonly PromptChoice[],
  ): Promise<PromptOutcome<string>> {
    while (true) {
      const selected = await this.multiselect(message, choices);
      if (selected.status === "cancelled") return selected;
      if (selected.value.length === 1) {
        return { status: "value", value: selected.value[0] as string };
      }
      this.write("  Choose exactly one option.\n");
    }
  }

  async multiselect(
    message: string,
    choices: readonly PromptChoice[],
  ): Promise<PromptOutcome<string[]>> {
    this.note(message);
    for (const [index, choice] of choices.entries()) {
      const marker = choice.disabled ? "[-]" : choice.selected ? "[x]" : "[ ]";
      this.write(
        `  ${index + 1}. ${marker} ${sanitizePromptText(choice.label)}\n`,
      );
    }
    while (true) {
      const answer = await this.ask("  Choose comma-separated numbers or names [default]: ");
      if (answer.status === "cancelled") return answer;
      const parsed = parsePromptSelection(answer.value, choices);
      if (parsed.ok) return { status: "value", value: parsed.value };
      this.write(`  ${parsed.message}\n`);
    }
  }

  async confirm(
    message: string,
    initial: boolean,
  ): Promise<PromptOutcome<boolean>> {
    const suffix = initial ? "[Y/n]" : "[y/N]";
    while (true) {
      const answer = await this.ask(`${sanitizePromptText(message)} ${suffix} `);
      if (answer.status === "cancelled") return answer;
      const normalized = answer.value.normalize("NFC").trim().toLowerCase();
      if (normalized.length === 0) return { status: "value", value: initial };
      if (normalized === "y" || normalized === "yes") {
        return { status: "value", value: true };
      }
      if (normalized === "n" || normalized === "no") {
        return { status: "value", value: false };
      }
      this.write("  Enter yes or no.\n");
    }
  }

  async text(
    message: string,
    initial: string,
  ): Promise<PromptOutcome<string>> {
    const answer = await this.ask(
      `${sanitizePromptText(message)} [${sanitizePromptText(initial)}] `,
    );
    if (answer.status === "cancelled") return answer;
    const normalized = answer.value.normalize("NFC").trim();
    return {
      status: "value",
      value: normalized.length === 0 ? initial : normalized,
    };
  }

  note(message: string): void {
    this.write(`${sanitizePromptText(message)}\n`);
  }

  detail(message: string): void {
    this.write(`${sanitizePromptDetail(message)}\n`);
  }

  startProgress(message: string): void {
    this.note(message);
  }

  stopProgress(message: string, success: boolean): void {
    this.note(`${success ? "Done" : "Failed"}: ${message}`);
  }

  close(): void {
    this.readline.close();
    this.output.removeListener("error", this.handleOutputError);
  }

  private ask(prompt: string): Promise<PromptOutcome<string>> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (outcome: PromptOutcome<string>) => {
        if (settled) return;
        settled = true;
        this.readline.removeListener("close", onClose);
        this.readline.removeListener("SIGINT", onSignal);
        this.signal?.removeEventListener("abort", onSignal);
        this.cancelActive = undefined;
        resolve(outcome);
      };
      const onClose = () => finish({ status: "cancelled", reason: "eof" });
      const onSignal = () => finish({ status: "cancelled", reason: "signal" });
      this.cancelActive = () => finish({ status: "cancelled", reason: "eof" });
      this.readline.once("close", onClose);
      this.readline.once("SIGINT", onSignal);
      this.signal?.addEventListener("abort", onSignal, { once: true });
      if (this.signal?.aborted) {
        onSignal();
        return;
      }
      this.readline.question(prompt, (answer) => {
        finish({ status: "value", value: answer });
      });
    });
  }

  private write(value: string): void {
    if (this.outputFailed) return;
    try {
      this.output.write(value);
    } catch {
      this.handleOutputError();
    }
  }
}
