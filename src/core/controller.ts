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
import {
  resolveAppearance,
  type SideGlanceAppearance,
} from "./appearance.ts";
import {
  createDefaultSurfaceRenderer,
  isGoneSurfaceError,
} from "../renderers/surface.ts";
import {
  shouldNotifyForEvent,
  type EventNotifier,
} from "../notifications/policy.ts";

export type { SurfaceVisual } from "./visual.ts";

export interface SurfaceRenderResult {
  terminalPainted: boolean;
  terminalTitlePainted?: boolean;
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

export interface SideGlanceControllerOptions {
  failOpenUnavailableSurface?: boolean;
}

export class SideGlanceController {
  private readonly store: FileSideGlanceStore;
  private readonly renderer: SurfaceRenderer;
  private readonly notifier?: EventNotifier;
  private readonly appearance: SideGlanceAppearance;
  private readonly failOpenUnavailableSurface: boolean;

  constructor(
    store: FileSideGlanceStore,
    renderer: SurfaceRenderer = createDefaultSurfaceRenderer(),
    notifier?: EventNotifier,
    appearance: SideGlanceAppearance = { preset: "status" },
    options: SideGlanceControllerOptions = {},
  ) {
    this.store = store;
    this.renderer = renderer;
    this.notifier = notifier;
    this.appearance = appearance;
    this.failOpenUnavailableSurface =
      options.failOpenUnavailableSurface === true;
  }

  async submit(event: SideGlanceEvent): Promise<SideGlanceState> {
    let accepted = false;
    let notifyAccepted = false;
    const result = await this.store.update(async (state) => {
      const key = sessionKey(event.source, event.sessionId);
      const previousSession = state.sessions[key];
      const candidate = reduceSideGlanceEvent(state, event);
      accepted = candidate !== state;
      if (!accepted) return state;
      const reconciledExpired = ["session.started", "turn.started", "work.started"].includes(
        event.kind,
      )
        ? reconcileExpiredSessions(state, event.occurredAt, key)
        : { state, surfaceIds: [] };
      const next = reduceSideGlanceEvent(reconciledExpired.state, event);
      const effectiveSession = next.sessions[key];
      notifyAccepted =
        accepted &&
        effectiveSession?.phase === notificationPhase(event.kind) &&
        !(
          event.kind === "turn.completed" &&
          effectiveSession?.confidence === "heuristic"
        ) &&
        !isSemanticNotificationDuplicate(previousSession, event);
      const nextSession = next.sessions[key];
      const affectedSurfaceIds = [
        ...reconciledExpired.surfaceIds,
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

    if (notifyAccepted && this.notifier && shouldNotifyForEvent(event)) {
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
      const resetPrevious = { ...previous };
      delete resetPrevious.tmuxSnapshot;
      delete resetPrevious.ownerKey;
      return {
        ...state,
        surfaces: {
          ...state.surfaces,
          [surfaceId]: {
            ...resetPrevious,
            phase: "inactive",
            generation: Math.max(previous.generation, event.generation ?? 0),
            updatedAt: event.occurredAt,
            terminalPainted: false,
            terminalTitlePainted: false,
          },
        },
      };
    }

    const target = resolution.session.target ?? previous?.target;
    if (!target) {
      throw new Error("Resolved surface owner does not have a render target.");
    }
    let rendered: SurfaceRenderResult;
    try {
      rendered = await this.renderer.paint(
        target,
        resolution.session,
        visualForSession(resolution.session, this.appearance),
        previous,
      );
    } catch (error) {
      if (!this.failOpenUnavailableSurface || !isGoneSurfaceError(error)) {
        throw error;
      }
      return detachUnavailableSurface(state, event, surfaceId, previous);
    }
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
          terminalTitlePainted: rendered.terminalTitlePainted ?? false,
          ownerKey: resolution.ownerKey,
          ...(rendered.tmuxSnapshot
            ? { tmuxSnapshot: rendered.tmuxSnapshot }
            : {}),
        },
      },
    };
  }
}

function detachUnavailableSurface(
  state: SideGlanceState,
  event: SideGlanceEvent,
  surfaceId: string,
  previous: SideGlanceSurfaceState | undefined,
): SideGlanceState {
  const sessions = Object.fromEntries(
    Object.entries(state.sessions).map(([key, session]) => {
      if (session.target?.surfaceId !== surfaceId) return [key, session];
      const detached = { ...session };
      delete detached.target;
      return [key, detached];
    }),
  );
  if (!previous) return { ...state, sessions };
  const inactive = { ...previous };
  delete inactive.ownerKey;
  delete inactive.tmuxSnapshot;
  return {
    ...state,
    sessions,
    surfaces: {
      ...state.surfaces,
      [surfaceId]: {
        ...inactive,
        phase: "inactive",
        generation: Math.max(previous.generation, event.generation ?? 0),
        updatedAt: event.occurredAt,
        terminalPainted: false,
        terminalTitlePainted: false,
      },
    },
  };
}

function isSemanticNotificationDuplicate(
  previous: SideGlanceSessionState | undefined,
  event: SideGlanceEvent,
): boolean {
  if (!previous || previous.phase !== notificationPhase(event.kind)) {
    return false;
  }
  if (
    event.generation !== undefined &&
    event.generation !== previous.generation
  ) {
    return false;
  }
  if (event.turnId && previous.turnId && event.turnId !== previous.turnId) {
    return false;
  }
  return true;
}

function notificationPhase(
  kind: SideGlanceEvent["kind"],
): SideGlanceSessionState["phase"] | undefined {
  switch (kind) {
    case "attention.waiting":
      return "waiting";
    case "turn.completed":
      return "completed";
    case "turn.failed":
    case "turn.cancelled":
      return "failed";
    case "session.started":
    case "turn.started":
    case "attention.acknowledged":
    case "session.ended":
    case "work.started":
    case "work.finished":
      return undefined;
  }
}

function reconcileExpiredSessions(
  state: SideGlanceState,
  occurredAt: number,
  exceptKey: string,
): { state: SideGlanceState; surfaceIds: string[] } {
  let sessions = state.sessions;
  const surfaceIds = new Set<string>();

  for (const [key, session] of Object.entries(state.sessions)) {
    if (
      key === exceptKey ||
      session.phase === "inactive" ||
      session.leaseExpiresAt === undefined ||
      session.leaseExpiresAt > occurredAt
    ) {
      continue;
    }

    if (sessions === state.sessions) sessions = { ...state.sessions };
    const rest = { ...session };
    delete rest.completedAt;
    delete rest.leaseExpiresAt;
    sessions[key] = {
      ...rest,
      phase: "inactive",
      reason: "reconciled-stale",
      updatedAt: occurredAt,
    };
    if (session.target) surfaceIds.add(session.target.surfaceId);
  }

  return {
    state: sessions === state.sessions ? state : { ...state, sessions },
    surfaceIds: [...surfaceIds],
  };
}

function visualForSession(
  session: SideGlanceSessionState,
  appearance: SideGlanceAppearance,
): SurfaceVisual {
  if (session.phase === "inactive") {
    throw new Error("Inactive sessions cannot own a rendered surface.");
  }
  const elapsedSeconds =
    session.phase === "completed" && session.startedAt !== undefined
      ? Math.max(0, session.updatedAt - session.startedAt) / 1_000
      : 90;
  const resolvedAppearance = resolveAppearance(
    appearance,
    session.completionCeilingSeconds ?? 300,
  );
  return visualForPhase(
    session.phase,
    elapsedSeconds,
    resolvedAppearance.completionCeilingSeconds,
    resolvedAppearance.theme,
    resolvedAppearance.suppressQuickCompletions,
  );
}
