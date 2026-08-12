import type {
  SignalSessionState,
  SignalSurfaceState,
  SignalTarget,
  SignalTmuxSnapshot,
} from "../core/protocol.ts";
import type {
  SurfaceRenderer,
  SurfaceRenderResult,
  SurfaceVisual,
} from "../core/controller.ts";
import { renderTerminal, TerminalGoneError } from "./terminal.ts";
import {
  applyTmuxPaint,
  captureTmuxSnapshot,
  createTmuxRunner,
  restoreTmuxSnapshot,
  type TmuxSnapshot,
} from "./tmux.ts";

export function createDefaultSurfaceRenderer(): SurfaceRenderer {
  return {
    async paint(
      target: SignalTarget,
      _session: SignalSessionState,
      visual: SurfaceVisual,
      previous?: SignalSurfaceState,
    ): Promise<SurfaceRenderResult> {
      if (visual.suppressed) {
        if (previous) await resetSurface(target, previous);
        return { terminalPainted: false };
      }

      const channels = surfaceChannels(target);
      let tmuxSnapshot = previous?.tmuxSnapshot;
      if (channels.tmux && target.tmuxPane) {
        const runner = createTmuxRunner();
        tmuxSnapshot ??= await captureTmuxSnapshot(runner, target.tmuxPane);
        await applyTmuxPaint(runner, asTmuxSnapshot(tmuxSnapshot), visual.accent);
      }
      if (!channels.terminal && previous?.terminalPainted && target.tty) {
        await renderTerminal(target.tty, "reset");
      }
      if (channels.terminal && target.tty) {
        await renderTerminal(target.tty, { wash: visual.wash });
      }

      return {
        terminalPainted: channels.terminal,
        ...(tmuxSnapshot ? { tmuxSnapshot } : {}),
      };
    },
    reset: resetSurface,
  };
}

export function surfaceChannels(target: SignalTarget): {
  terminal: boolean;
  tmux: boolean;
} {
  const tmux = Boolean(target.tmuxPane);
  return {
    terminal: Boolean(target.tty) && !tmux,
    tmux,
  };
}

async function resetSurface(
  target: SignalTarget,
  previous: SignalSurfaceState,
): Promise<void> {
  if (target.tty && previous.terminalPainted) {
    try {
      await renderTerminal(target.tty, "reset");
    } catch (error) {
      if (!isGoneSurfaceError(error)) throw error;
    }
  }
  if (previous.tmuxSnapshot) {
    try {
      await restoreTmuxSnapshot(
        createTmuxRunner(),
        asTmuxSnapshot(previous.tmuxSnapshot),
      );
    } catch (error) {
      if (!isGoneSurfaceError(error)) throw error;
    }
  }
}

function isGoneSurfaceError(error: unknown): boolean {
  if (error instanceof TerminalGoneError) return true;
  if (typeof error !== "object" || error === null) return false;
  if (
    "code" in error &&
    ["ENOENT", "ENXIO", "EIO", "ENODEV", "ESRCH", "EPERM"].includes(
      String(error.code),
    )
  ) {
    return true;
  }
  const message = "message" in error ? String(error.message) : "";
  return /can't find (?:pane|window|session)|no server running|failed to connect|error connecting/iu.test(
    message,
  );
}

function asTmuxSnapshot(snapshot: SignalTmuxSnapshot): TmuxSnapshot {
  return snapshot;
}
