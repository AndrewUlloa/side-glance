import { createInterface, type Interface } from "node:readline";

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
  multiselect(
    message: string,
    choices: readonly PromptChoice[],
  ): Promise<PromptOutcome<string[]>>;
  confirm(message: string, initial: boolean): Promise<PromptOutcome<boolean>>;
  text(message: string, initial: string): Promise<PromptOutcome<string>>;
  note(message: string): void;
  detail?(message: string): void;
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
    .replace(/\s+/gu, " ")
    .trim();
  const codePoints = [...normalized];
  if (codePoints.length <= MAX_PROMPT_TEXT_CODE_POINTS) return normalized;
  return `${codePoints.slice(0, MAX_PROMPT_TEXT_CODE_POINTS - 1).join("")}…`;
}

export function sanitizePromptDetail(value: string): string {
  return value.normalize("NFC").replace(/\p{Cc}/gu, " ");
}

export function createReadlineSetupPrompter(options: {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}): SetupPrompter {
  return new ReadlineSetupPrompter(options);
}

class ReadlineSetupPrompter implements SetupPrompter {
  private readonly readline: Interface;
  private readonly output: NodeJS.WritableStream;

  constructor(options: {
    input: NodeJS.ReadableStream;
    output: NodeJS.WritableStream;
  }) {
    this.output = options.output;
    this.readline = createInterface({
      input: options.input,
      output: options.output,
      terminal: Boolean(
        (options.input as NodeJS.ReadableStream & { isTTY?: boolean }).isTTY &&
          (options.output as NodeJS.WritableStream & { isTTY?: boolean }).isTTY &&
          process.env.NO_COLOR === undefined,
      ),
    });
  }

  async multiselect(
    message: string,
    choices: readonly PromptChoice[],
  ): Promise<PromptOutcome<string[]>> {
    this.note(message);
    for (const [index, choice] of choices.entries()) {
      const marker = choice.disabled ? "[-]" : choice.selected ? "[x]" : "[ ]";
      this.output.write(
        `  ${index + 1}. ${marker} ${sanitizePromptText(choice.label)}\n`,
      );
    }
    while (true) {
      const answer = await this.ask("  Choose comma-separated numbers or names [default]: ");
      if (answer.status === "cancelled") return answer;
      const parsed = parsePromptSelection(answer.value, choices);
      if (parsed.ok) return { status: "value", value: parsed.value };
      this.output.write(`  ${parsed.message}\n`);
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
      this.output.write("  Enter yes or no.\n");
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
    this.output.write(`${sanitizePromptText(message)}\n`);
  }

  detail(message: string): void {
    this.output.write(`${sanitizePromptDetail(message)}\n`);
  }

  close(): void {
    this.readline.close();
  }

  private ask(prompt: string): Promise<PromptOutcome<string>> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (outcome: PromptOutcome<string>) => {
        if (settled) return;
        settled = true;
        this.readline.removeListener("close", onClose);
        this.readline.removeListener("SIGINT", onSignal);
        resolve(outcome);
      };
      const onClose = () => finish({ status: "cancelled", reason: "eof" });
      const onSignal = () => finish({ status: "cancelled", reason: "signal" });
      this.readline.once("close", onClose);
      this.readline.once("SIGINT", onSignal);
      this.readline.question(prompt, (answer) => {
        finish({ status: "value", value: answer });
      });
    });
  }
}
