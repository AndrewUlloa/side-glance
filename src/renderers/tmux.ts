import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { SideGlancePhase } from "../core/protocol.ts";

const execFileAsync = promisify(execFile);
const TMUX_OPTIONS = [
  "window-status-style",
  "window-status-current-style",
  "window-status-format",
  "window-status-current-format",
] as const;
type OwnedTmuxOption = (typeof TMUX_OPTIONS)[number];

export interface TmuxCommandResult {
  stdout: string;
}

export interface TmuxRunner {
  run(args: readonly string[]): Promise<TmuxCommandResult>;
}

export interface TmuxOptionSnapshot {
  name: OwnedTmuxOption;
  local: boolean;
  value?: string;
}

export interface TmuxSnapshot {
  windowId: string;
  options: TmuxOptionSnapshot[];
}

export function createTmuxRunner(options: {
  executable?: string;
  socketPath?: string;
} = {}): TmuxRunner {
  const executable = options.executable ?? "tmux";
  if (executable.includes("\u0000")) {
    throw new Error("tmux executable may not contain a null byte.");
  }
  if (
    options.socketPath !== undefined &&
    (!path.isAbsolute(options.socketPath) || options.socketPath.includes("\u0000"))
  ) {
    throw new Error("tmux socket path must be absolute.");
  }
  const prefix = options.socketPath ? ["-S", options.socketPath] : [];

  return {
    async run(args): Promise<TmuxCommandResult> {
      const { stdout } = await execFileAsync(executable, [...prefix, ...args], {
        encoding: "utf8",
        maxBuffer: 64 * 1_024,
        timeout: 5_000,
      });
      return { stdout };
    },
  };
}

export async function captureTmuxSnapshot(
  runner: TmuxRunner,
  paneId: string,
): Promise<TmuxSnapshot> {
  assertPaneId(paneId);
  const windowId = (
    await runner.run(["display-message", "-p", "-t", paneId, "#{window_id}"])
  ).stdout.trim();
  assertWindowId(windowId);

  const options: TmuxOptionSnapshot[] = [];
  for (const name of TMUX_OPTIONS) {
    const localOutput = (
      await runner.run(["show-options", "-w", "-q", "-t", windowId, name])
    ).stdout;
    if (localOutput.length === 0) {
      options.push({ name, local: false });
      continue;
    }

    const value = (
      await runner.run([
        "show-options",
        "-w",
        "-v",
        "-q",
        "-t",
        windowId,
        name,
      ])
    ).stdout.replace(/\r?\n$/u, "");
    options.push({ name, local: true, value });
  }

  return { windowId, options };
}

export async function applyTmuxPaint(
  runner: TmuxRunner,
  snapshot: TmuxSnapshot,
  accent: string,
  phase: SideGlancePhase,
): Promise<void> {
  if (!/^[0-9a-f]{6}$/i.test(accent)) {
    throw new Error("tmux accent color must be six hexadecimal digits.");
  }
  validateSnapshot(snapshot);
  const color = accent.toLowerCase();
  const marker = markerForPhase(phase);
  const values: Record<OwnedTmuxOption, string> = {
    "window-status-style": `fg=#${color}`,
    "window-status-current-style": `fg=#${color},bold`,
    "window-status-format": `#[fg=#${color}]${marker} #[default]#I:#W`,
    "window-status-current-format": `#[fg=#${color},bold]${marker} #I:#W#[default]`,
  };

  try {
    for (const name of TMUX_OPTIONS) {
      await runner.run([
        "set-option",
        "-w",
        "-t",
        snapshot.windowId,
        name,
        values[name],
      ]);
    }
  } catch (paintError) {
    try {
      await restoreTmuxSnapshot(runner, snapshot);
    } catch (restoreError) {
      throw new AggregateError(
        [paintError, restoreError],
        "tmux painting failed and its prior options could not be restored.",
      );
    }
    throw paintError;
  }
}

function markerForPhase(phase: SideGlancePhase): string {
  switch (phase) {
    case "working":
      return "●";
    case "waiting":
      return "!";
    case "completed":
      return "✓";
    case "failed":
      return "×";
    case "inactive":
      throw new Error("tmux paint requires an active Side Glance phase.");
  }
}

export async function restoreTmuxSnapshot(
  runner: TmuxRunner,
  snapshot: TmuxSnapshot,
): Promise<void> {
  validateSnapshot(snapshot);
  for (const option of snapshot.options) {
    if (option.local) {
      await runner.run([
        "set-option",
        "-w",
        "-t",
        snapshot.windowId,
        option.name,
        option.value ?? "",
      ]);
    } else {
      await runner.run([
        "set-option",
        "-w",
        "-u",
        "-t",
        snapshot.windowId,
        option.name,
      ]);
    }
  }
}

function validateSnapshot(snapshot: TmuxSnapshot): void {
  assertWindowId(snapshot.windowId);
  if (snapshot.options.length !== TMUX_OPTIONS.length) {
    throw new Error("tmux snapshot does not contain every Side Glance-owned option.");
  }

  const names = new Set<string>();
  for (const option of snapshot.options) {
    if (!TMUX_OPTIONS.includes(option.name)) {
      throw new Error(`tmux snapshot contains an unknown option: ${option.name}`);
    }
    if (names.has(option.name)) {
      throw new Error(`tmux snapshot contains a duplicate option: ${option.name}`);
    }
    if (option.local !== (option.value !== undefined)) {
      throw new Error("tmux local option snapshots must retain their exact value.");
    }
    if (option.value?.includes("\u0000")) {
      throw new Error("tmux option values may not contain a null byte.");
    }
    names.add(option.name);
  }
}

function assertPaneId(paneId: string): void {
  if (!/^%\d+$/u.test(paneId)) {
    throw new Error("tmux pane ID must use the canonical %number form.");
  }
}

function assertWindowId(windowId: string): void {
  if (!/^@\d+$/u.test(windowId)) {
    throw new Error("tmux window ID must use the canonical @number form.");
  }
}
