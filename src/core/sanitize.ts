const MAX_TERMINAL_LABEL_CODE_POINTS = 120;

export function sanitizeTerminalLabel(label: string): string {
  if ([...label].some(isTerminalControlCharacter)) {
    throw new Error("Terminal labels may not contain control characters.");
  }

  const normalized = label.normalize("NFC");
  if (normalized.trim().length === 0) {
    throw new Error("Terminal labels may not be empty.");
  }
  if ([...normalized].length > MAX_TERMINAL_LABEL_CODE_POINTS) {
    throw new Error(
      `Terminal labels may not exceed ${MAX_TERMINAL_LABEL_CODE_POINTS} characters.`,
    );
  }

  return normalized;
}

function isTerminalControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
}
