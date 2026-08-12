import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { SignalTarget } from "./protocol.ts";

const execFileAsync = promisify(execFile);

export interface TargetDiscoveryOptions {
  environment?: Readonly<Record<string, string | undefined>>;
  resolveTty?: () => Promise<string | undefined>;
  surfaceId?: string;
  tty?: string;
  tmuxPane?: string;
}

export async function discoverTerminalTarget(
  options: TargetDiscoveryOptions = {},
): Promise<SignalTarget> {
  const environment = options.environment ?? process.env;
  const explicitSurface = options.surfaceId ?? environment.SIGNAL_SURFACE_ID;
  const explicitTty = options.tty ?? environment.SIGNAL_TTY;
  const tmuxPane =
    options.tmuxPane ?? environment.SIGNAL_TMUX_PANE ?? environment.TMUX_PANE;

  if (explicitSurface) validateSurfaceId(explicitSurface);
  if (explicitTty) validateTtyPath(explicitTty);
  if (tmuxPane && !/^%\d+$/u.test(tmuxPane)) {
    throw new Error("tmux pane identity must use the canonical %number form.");
  }

  const tty =
    explicitTty ??
    (explicitSurface || tmuxPane
      ? undefined
      : await (options.resolveTty ?? resolveControllingTty)());
  if (tty) validateTtyPath(tty);

  let surfaceId = explicitSurface;
  if (!surfaceId && tmuxPane && environment.TMUX) {
    validateText(environment.TMUX, "tmux server identity", 1_024);
    surfaceId = `tmux:${environment.TMUX},${tmuxPane}`;
  }
  surfaceId ??= tty ? `tty:${tty}` : undefined;
  if (!surfaceId) {
    throw new Error(
      "No controlling terminal surface was found; pass --surface or run from a TTY.",
    );
  }

  return {
    surfaceId,
    ...(tty ? { tty } : {}),
    ...(tmuxPane ? { tmuxPane } : {}),
  };
}

async function resolveControllingTty(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("tty", [], {
      encoding: "utf8",
      maxBuffer: 4_096,
      timeout: 2_000,
    });
    const tty = stdout.trim();
    return tty.startsWith("/dev/") ? tty : undefined;
  } catch {
    return undefined;
  }
}

function validateTtyPath(value: string): void {
  if (!/^\/dev\/(?:ttys?\d+|pts\/\d+)$/u.test(value)) {
    throw new Error("TTY device must be a canonical /dev/tty* or /dev/pts/* path.");
  }
}

function validateSurfaceId(value: string): void {
  validateText(value, "surface ID", 512);
}

function validateText(value: string, label: string, maximum: number): void {
  if (value.length === 0 || [...value].length > maximum) {
    throw new Error(`${label} must contain 1 to ${maximum} characters.`);
  }
  if ([...value].some(isControlCharacter)) {
    throw new Error(`${label} may not contain control characters.`);
  }
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
}
