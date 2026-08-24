import { resolveSurface } from "./leases.ts";
import { compactSideGlanceState } from "./compact.ts";
import {
  sessionKey,
  type SideGlanceEvent,
  type SideGlanceSessionState,
  type SideGlanceState,
  type SideGlanceSurfaceState,
  type SideGlanceTarget,
  type SideGlanceTmuxSnapshot,
} from "./protocol.ts";
import { reduceSideGlanceEvent } from "./reducer.ts";
import type { FileSideGlanceStore } from "./store.ts";
import { visualForPhase, type SurfaceVisual } from "./visual.ts";
import { createDefaultSurfaceRenderer } from "../renderers/surface.ts";
import {
  shouldNotifyForEvent,
  type EventNotifier,
} from "../notifications/policy.ts";

export type { SurfaceVisual } from "./visual.ts";

export interface SurfaceRenderResult {
  terminalPainted: boolean;
  tmuxSnapshot?: SideGlanceTmuxSnapshot;
}

export interface SurfaceRenderer {
  paint(
    target: SideGlanceTarget,
    session: SideGlanceSessionState,
    visual: SurfaceVisual,
    previous?: SideGlanceSurfaceState,
  ): Promise<SurfaceRenderResult>;
  reset(target: SideGlanceTarget, previous: SideGlanceSurfaceState): Promise<void>;
}

export class SideGlanceController {
  private readonly store: FileSideGlanceStore;
  private readonly renderer: SurfaceRenderer;
  private readonly notifier?: EventNotifier;

  constructor(
    store: FileSideGlanceStore,
    renderer: SurfaceRenderer = createDefaultSurfaceRenderer(),
    notifier?: EventNotifier,
  ) {
    this.store = store;
    this.renderer = renderer;
    this.notifier = notifier;
  }

  async submit(event: SideGlanceEvent): Promise<SideGlanceState> {
    let accepted = false;
    const result = await this.store.update(async (state) => {
      const key = sessionKey(event.source, event.sessionId);
      const previousSession = state.sessions[key];
      const next = reduceSideGlanceEvent(state, event);
      if (next === state) return next;
      accepted = true;
      const nextSession = next.sessions[key];
      const affectedSurfaceIds = [
        previousSession?.target?.surfaceId,
        nextSession?.target?.surfaceId,
      ].filter((surfaceId, index, values): surfaceId is string =>
        Boolean(surfaceId) && values.indexOf(surfaceId) === index
      );
      let reconciled = next;
      for (const surfaceId of affectedSurfaceIds) {
        reconciled = await this.reconcileSurface(reconciled, event, surfaceId);
      }
      return compactSideGlanceState(reconciled);
    });

    if (accepted && this.notifier && shouldNotifyForEvent(event)) {
      try {
        await this.notifier.notify(event);
      } catch {
        // Notification failure must not roll back an accepted lifecycle event.
      }
    }
    return result;
  }

  private async reconcileSurface(
    state: SideGlanceState,
    event: SideGlanceEvent,
    surfaceId: string,
  ): Promise<SideGlanceState> {
    const previous = state.surfaces[surfaceId];
    const resolution = resolveSurface(state, surfaceId);
    if (!resolution) {
      if (!previous) return state;
      await this.renderer.reset(previous.target, previous);
      return {
        ...state,
        surfaces: {
          ...state.surfaces,
          [surfaceId]: {
            ...previous,
            phase: "inactive",
            generation: Math.max(previous.generation, event.generation ?? 0),
            updatedAt: event.occurredAt,
            terminalPainted: false,
            tmuxSnapshot: undefined,
            ownerKey: undefined,
          },
        },
      };
    }

    const target = resolution.session.target ?? previous?.target;
    if (!target) {
      throw new Error("Resolved surface owner does not have a render target.");
    }
    const rendered = await this.renderer.paint(
      target,
      resolution.session,
      visualForSession(resolution.session),
      previous,
    );
    return {
      ...state,
      surfaces: {
        ...state.surfaces,
        [surfaceId]: {
          surfaceId,
          target,
          phase: resolution.session.phase,
          generation: resolution.session.generation,
          updatedAt: event.occurredAt,
          terminalPainted: rendered.terminalPainted,
          ownerKey: resolution.ownerKey,
          ...(rendered.tmuxSnapshot
            ? { tmuxSnapshot: rendered.tmuxSnapshot }
            : {}),
        },
      },
    };
  }
}

function visualForSession(session: SideGlanceSessionState): SurfaceVisual {
  if (session.phase === "inactive") {
    throw new Error("Inactive sessions cannot own a rendered surface.");
  }
  const elapsedSeconds =
    session.phase === "completed" && session.startedAt !== undefined
      ? Math.max(0, session.updatedAt - session.startedAt) / 1_000
      : 90;
  return visualForPhase(
    session.phase,
    elapsedSeconds,
    session.responseEwmaSeconds ?? 120,
  );
}
