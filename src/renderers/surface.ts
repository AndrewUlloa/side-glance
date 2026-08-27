import type {
  SideGlancePhase,
  SideGlanceSessionState,
  SideGlanceSurfaceState,
  SideGlanceTarget,
  SideGlanceTmuxSnapshot,
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

export interface DefaultSurfaceRendererOptions {
  terminalTitle?: boolean;
}

export function createDefaultSurfaceRenderer(
  options: DefaultSurfaceRendererOptions = {},
): SurfaceRenderer {
  return {
    async paint(
      target: SideGlanceTarget,
      session: SideGlanceSessionState,
      visual: SurfaceVisual,
      previous?: SideGlanceSurfaceState,
    ): Promise<SurfaceRenderResult> {
      if (visual.suppressed) {
        if (previous) await resetSurface(target, previous);
        return { terminalPainted: false, terminalTitlePainted: false };
      }

      const channels = surfaceChannels(target);
      let tmuxSnapshot = previous?.tmuxSnapshot;
      if (channels.tmux && target.tmuxPane) {
        const runner = createTmuxRunner();
        tmuxSnapshot ??= await captureTmuxSnapshot(runner, target.tmuxPane);
        await applyTmuxPaint(
          runner,
          asTmuxSnapshot(tmuxSnapshot),
          visual.accent,
          session.phase,
        );
      }
      if (
        !channels.terminal &&
        target.tty &&
        (previous?.terminalPainted || previous?.terminalTitlePainted)
      ) {
        await renderTerminal(target.tty, {
          reset: {
            background: previous.terminalPainted,
            title: previous.terminalTitlePainted,
          },
        });
      }
      if (channels.terminal && target.tty) {
        if (previous?.terminalTitlePainted && !options.terminalTitle) {
          await renderTerminal(target.tty, { reset: { title: true } });
        }
        await renderTerminal(target.tty, {
          wash: visual.wash,
          ...(options.terminalTitle
            ? {
                title: terminalTitleForPhase(session.phase),
                allowTitle: true,
              }
            : {}),
        });
      }

      return {
        terminalPainted: channels.terminal,
        terminalTitlePainted: channels.terminal && options.terminalTitle === true,
        ...(tmuxSnapshot ? { tmuxSnapshot } : {}),
      };
    },
    reset: resetSurface,
  };
}

export function terminalTitleForPhase(phase: SideGlancePhase): string {
  switch (phase) {
    case "working":
      return "Side Glance · Working";
    case "waiting":
      return "Side Glance · Waiting";
    case "completed":
      return "Side Glance · Ready";
    case "failed":
      return "Side Glance · Failed";
    case "inactive":
      return "Side Glance · Inactive";
  }
}

export function surfaceChannels(target: SideGlanceTarget): {
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
  target: SideGlanceTarget,
  previous: SideGlanceSurfaceState,
): Promise<void> {
  if (
    target.tty &&
    (previous.terminalPainted || previous.terminalTitlePainted)
  ) {
    try {
      await renderTerminal(target.tty, {
        reset: {
          background: previous.terminalPainted,
          title: previous.terminalTitlePainted,
        },
      });
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

export function isGoneSurfaceError(error: unknown): boolean {
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
  return /can't find (?:pane|window|session)|no server running|failed to connect|error connecting|terminal target (?:changed|is not|may not|must be)|direct terminal rendering is unsupported/iu.test(
    message,
  );
}

function asTmuxSnapshot(snapshot: SideGlanceTmuxSnapshot): TmuxSnapshot {
  return snapshot;
}
