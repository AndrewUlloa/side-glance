import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";

import { sanitizeTerminalLabel } from "../core/sanitize.ts";

const encoder = new TextEncoder();
const OSC_START = "\u001b]";
const STRING_TERMINATOR = "\u001b\\";

export interface TerminalPaint {
  wash: string;
  title?: string;
  allowTitle?: boolean;
}

export interface TerminalReset {
  background?: boolean;
  title?: boolean;
}

export class TerminalGoneError extends Error {
  override readonly name = "TerminalGoneError";
}

export function encodeTerminalPaint(paint: TerminalPaint): Uint8Array {
  if (!/^[0-9a-f]{6}$/i.test(paint.wash)) {
    throw new Error("Terminal wash color must be six hexadecimal digits.");
  }

  let sequence = `${OSC_START}11;#${paint.wash.toLowerCase()}${STRING_TERMINATOR}`;
  if (paint.title !== undefined) {
    if (!paint.allowTitle) {
      throw new Error("Terminal title changes require explicit opt-in.");
    }
    const title = sanitizeTerminalLabel(paint.title);
    sequence += `${OSC_START}0;${title}${STRING_TERMINATOR}`;
  }

  return encoder.encode(sequence);
}

export function encodeTerminalReset(
  reset: TerminalReset = { background: true },
): Uint8Array {
  let sequence = reset.background
    ? `${OSC_START}111${STRING_TERMINATOR}`
    : "";
  if (reset.title) sequence += `${OSC_START}0;${STRING_TERMINATOR}`;
  if (!sequence) throw new Error("Terminal reset must select an owned channel.");
  return encoder.encode(sequence);
}

export async function renderTerminal(
  ttyPath: string,
  paint: TerminalPaint | "reset" | { reset: TerminalReset },
): Promise<void> {
  const bytes =
    paint === "reset"
      ? encodeTerminalReset()
      : "reset" in paint
        ? encodeTerminalReset(paint.reset)
        : encodeTerminalPaint(paint);
  const beforeOpen = await inspectTerminalPath(ttyPath);
  const handle = await open(
    ttyPath,
    constants.O_WRONLY | constants.O_NOCTTY | constants.O_NOFOLLOW,
  );

  try {
    const afterOpen = await handle.stat();
    assertOwnedCharacterDevice(afterOpen, ttyPath);
    if (afterOpen.dev !== beforeOpen.dev || afterOpen.ino !== beforeOpen.ino) {
      throw new Error("Terminal target changed while it was being opened.");
    }
    await writeAll(handle, bytes);
  } finally {
    await handle.close();
  }
}

async function inspectTerminalPath(ttyPath: string) {
  if (ttyPath.includes("\u0000") || !path.isAbsolute(ttyPath)) {
    throw new Error("Terminal target must be an absolute device path.");
  }

  let metadata;
  try {
    metadata = await lstat(ttyPath);
  } catch (error) {
    if (hasCode(error, "ENOENT")) {
      throw new TerminalGoneError(`Terminal target does not exist: ${ttyPath}`);
    }
    throw error;
  }

  if (metadata.isSymbolicLink()) {
    throw new Error("Terminal target may not be a symbolic link.");
  }
  assertOwnedCharacterDevice(metadata, ttyPath);

  if (process.platform !== "win32" && !ttyPath.startsWith("/dev/")) {
    throw new Error("Terminal target must be located beneath /dev.");
  }

  return metadata;
}

function assertOwnedCharacterDevice(
  metadata: Awaited<ReturnType<typeof lstat>>,
  ttyPath: string,
): void {
  if (!metadata.isCharacterDevice()) {
    throw new Error(`Terminal target is not a character device: ${ttyPath}`);
  }

  if (typeof process.getuid !== "function") {
    throw new Error("Direct terminal rendering is unsupported on this platform.");
  }
  if (metadata.uid !== process.getuid()) {
    throw new Error("Terminal target is not owned by the current user.");
  }
}

async function writeAll(
  handle: Awaited<ReturnType<typeof open>>,
  bytes: Uint8Array,
): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await handle.write(
      bytes,
      offset,
      bytes.byteLength - offset,
    );
    if (bytesWritten === 0) {
      throw new TerminalGoneError(
        "Terminal closed before Side Glance could finish rendering.",
      );
    }
    offset += bytesWritten;
  }
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
