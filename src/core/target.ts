import { spawn } from "node:child_process";
import type { Readable, Stream } from "node:stream";

import type { SideGlanceTarget } from "./protocol.ts";

interface TtyProcess {
  kill: (signal: NodeJS.Signals) => boolean;
  onClose: (listener: (code: number | null) => void) => void;
  onError: (listener: (error: Error) => void) => void;
  stdout: Readable;
}

interface TtySpawnOptions {
  stdio: [Stream, "pipe", "ignore"];
}

type SpawnTtyProcess = (
  command: string,
  arguments_: string[],
  options: TtySpawnOptions,
) => TtyProcess;

export interface TargetDiscoveryOptions {
  environment?: Readonly<Record<string, string | undefined>>;
  resolveTty?: () => Promise<string | undefined>;
  spawnProcess?: SpawnTtyProcess;
  surfaceId?: string;
  tty?: string;
  tmuxPane?: string;
}

export async function discoverTerminalTarget(
  options: TargetDiscoveryOptions = {},
): Promise<SideGlanceTarget> {
  const target = await discoverTarget(options);
  if (!target) {
    throw new Error(
      "No controlling terminal surface was found; pass --surface or run from a TTY.",
    );
  }
  return target;
}

export async function discoverOptionalTerminalTarget(
  options: TargetDiscoveryOptions = {},
): Promise<SideGlanceTarget | undefined> {
  return discoverTarget(options);
}

async function discoverTarget(
  options: TargetDiscoveryOptions,
): Promise<SideGlanceTarget | undefined> {
  const environment = options.environment ?? process.env;
  const explicitSurface =
    options.surfaceId ??
    environment.SIDE_GLANCE_SURFACE_ID ??
    environment.SIGNAL_SURFACE_ID;
  const explicitTty =
    options.tty ?? environment.SIDE_GLANCE_TTY ?? environment.SIGNAL_TTY;
  const tmuxPane =
    options.tmuxPane ??
    environment.SIDE_GLANCE_TMUX_PANE ??
    environment.SIGNAL_TMUX_PANE ??
    environment.TMUX_PANE;

  if (explicitSurface) validateSurfaceId(explicitSurface);
  if (explicitTty) validateTtyPath(explicitTty);
  if (tmuxPane && !/^%\d+$/u.test(tmuxPane)) {
    throw new Error("tmux pane identity must use the canonical %number form.");
  }

  const tty =
    explicitTty ??
    (explicitSurface || tmuxPane
      ? undefined
      : await (options.resolveTty ??
          (() => resolveControllingTty(options.spawnProcess)))());
  if (tty) validateTtyPath(tty);

  let surfaceId = explicitSurface;
  if (!surfaceId && tmuxPane && environment.TMUX) {
    validateText(environment.TMUX, "tmux server identity", 1_024);
    surfaceId = `tmux:${environment.TMUX},${tmuxPane}`;
  }
  surfaceId ??= tty ? `tty:${tty}` : undefined;
  if (!surfaceId) return undefined;

  return {
    surfaceId,
    ...(tty ? { tty } : {}),
    ...(tmuxPane ? { tmuxPane } : {}),
  };
}

async function resolveControllingTty(
  spawnProcess: SpawnTtyProcess = defaultSpawnTtyProcess,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    let child: TtyProcess;
    try {
      child = spawnProcess("tty", [], {
        stdio: [process.stdin, "pipe", "ignore"],
      });
    } catch {
      resolve(undefined);
      return;
    }

    let output = "";
    let settled = false;
    function finish(value: string | undefined): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    }

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(undefined);
    }, 2_000);
    timeout.unref();

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (output.length + chunk.length > 4_096) {
        child.kill("SIGTERM");
        finish(undefined);
        return;
      }
      output += chunk;
    });
    child.onError(() => finish(undefined));
    child.onClose((code) => {
      const tty = output.trim();
      finish(code === 0 && tty.startsWith("/dev/") ? tty : undefined);
    });
  });
}

function defaultSpawnTtyProcess(
  command: string,
  arguments_: string[],
  options: TtySpawnOptions,
): TtyProcess {
  const child = spawn(command, arguments_, options);
  if (!child.stdout) throw new Error("tty stdout was unavailable.");
  return {
    stdout: child.stdout,
    kill: (signal) => child.kill(signal),
    onClose: (listener) => {
      child.once("close", (code) => listener(code));
    },
    onError: (listener) => {
      child.once("error", listener);
    },
  };
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
