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
import { renderTerminal } from "./terminal.ts";
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

      let tmuxSnapshot = previous?.tmuxSnapshot;
      if (target.tmuxPane) {
        const runner = createTmuxRunner();
        tmuxSnapshot ??= await captureTmuxSnapshot(runner, target.tmuxPane);
        await applyTmuxPaint(runner, asTmuxSnapshot(tmuxSnapshot), visual.accent);
      }
      if (target.tty) {
        await renderTerminal(target.tty, { wash: visual.wash });
      }

      return {
        terminalPainted: Boolean(target.tty),
        ...(tmuxSnapshot ? { tmuxSnapshot } : {}),
      };
    },
    reset: resetSurface,
  };
}

async function resetSurface(
  target: SignalTarget,
  previous: SignalSurfaceState,
): Promise<void> {
  if (target.tty && previous.terminalPainted) {
    await renderTerminal(target.tty, "reset");
  }
  if (previous.tmuxSnapshot) {
    await restoreTmuxSnapshot(
      createTmuxRunner(),
      asTmuxSnapshot(previous.tmuxSnapshot),
    );
  }
}

function asTmuxSnapshot(snapshot: SignalTmuxSnapshot): TmuxSnapshot {
  return snapshot;
}
