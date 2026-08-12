import { resolveSurface } from "./leases.ts";
import { compactSignalState } from "./compact.ts";
import { urgencyFromElapsed } from "./policy.ts";
import type {
  SignalEvent,
  SignalSessionState,
  SignalState,
  SignalSurfaceState,
  SignalTarget,
  SignalTmuxSnapshot,
} from "./protocol.ts";
import { reduceSignalEvent } from "./reducer.ts";
import type { FileSignalStore } from "./store.ts";
import { DEFAULT_SIGNAL_THEME } from "./theme.ts";
import { createDefaultSurfaceRenderer } from "../renderers/surface.ts";

export interface SurfaceVisual {
  wash: string;
  accent: string;
  urgency: number;
  suppressed: boolean;
}

export interface SurfaceRenderResult {
  terminalPainted: boolean;
  tmuxSnapshot?: SignalTmuxSnapshot;
}

export interface SurfaceRenderer {
  paint(
    target: SignalTarget,
    session: SignalSessionState,
    visual: SurfaceVisual,
    previous?: SignalSurfaceState,
  ): Promise<SurfaceRenderResult>;
  reset(target: SignalTarget, previous: SignalSurfaceState): Promise<void>;
}

export class SignalController {
  private readonly store: FileSignalStore;
  private readonly renderer: SurfaceRenderer;

  constructor(
    store: FileSignalStore,
    renderer: SurfaceRenderer = createDefaultSurfaceRenderer(),
  ) {
    this.store = store;
    this.renderer = renderer;
  }

  async submit(event: SignalEvent): Promise<SignalState> {
    return this.store.update(async (state) => {
      const next = reduceSignalEvent(state, event);
      if (next === state || !event.target) return next;

      const { surfaceId } = event.target;
      const previous = state.surfaces[surfaceId];
      const resolution = resolveSurface(next, surfaceId);
      if (!resolution) {
        if (!previous) return next;
        await this.renderer.reset(previous.target, previous);
        return compactSignalState({
          ...next,
          surfaces: {
            ...next.surfaces,
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
        });
      }

      const target = resolution.session.target ?? previous?.target ?? event.target;
      const rendered = await this.renderer.paint(
        target,
        resolution.session,
        visualForSession(resolution.session),
        previous,
      );
      return compactSignalState({
        ...next,
        surfaces: {
          ...next.surfaces,
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
      });
    });
  }
}

function visualForSession(session: SignalSessionState): SurfaceVisual {
  switch (session.phase) {
    case "working":
      return {
        wash: DEFAULT_SIGNAL_THEME.workingWash,
        accent: DEFAULT_SIGNAL_THEME.workingAccent,
        urgency: 0,
        suppressed: false,
      };
    case "waiting":
      return {
        wash: DEFAULT_SIGNAL_THEME.waitingWash,
        accent: DEFAULT_SIGNAL_THEME.waitingAccent,
        urgency: 0,
        suppressed: false,
      };
    case "completed": {
      const elapsed =
        session.startedAt === undefined
          ? 90
          : Math.max(0, session.updatedAt - session.startedAt);
      return urgencyFromElapsed(elapsed, 120);
    }
    case "failed":
      return {
        wash: DEFAULT_SIGNAL_THEME.washStops.at(-1) ?? "732018",
        accent: DEFAULT_SIGNAL_THEME.tmuxStops.at(-1) ?? "f33533",
        urgency: 1_000,
        suppressed: false,
      };
    case "inactive":
      throw new Error("Inactive sessions cannot own a rendered surface.");
  }
}
