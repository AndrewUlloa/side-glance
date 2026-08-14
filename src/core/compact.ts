import type {
  SideGlanceSessionState,
  SideGlanceState,
  SideGlanceSurfaceState,
} from "./protocol.ts";

const MAX_INACTIVE_SESSIONS = 512;
const MAX_INACTIVE_SURFACES = 256;

export function compactSideGlanceState(state: SideGlanceState): SideGlanceState {
  const sessions = boundInactiveEntries(
    state.sessions,
    MAX_INACTIVE_SESSIONS,
    (session) => session.phase === "inactive",
  );
  const surfaces = boundInactiveEntries(
    state.surfaces,
    MAX_INACTIVE_SURFACES,
    (surface) => surface.phase === "inactive",
  );
  if (sessions === state.sessions && surfaces === state.surfaces) return state;
  return { ...state, sessions, surfaces };
}

function boundInactiveEntries<T extends SideGlanceSessionState | SideGlanceSurfaceState>(
  entries: Record<string, T>,
  maximum: number,
  isInactive: (entry: T) => boolean,
): Record<string, T> {
  const inactive = Object.entries(entries).filter(([, entry]) => isInactive(entry));
  if (inactive.length <= maximum) return entries;

  inactive.sort(
    ([leftKey, left], [rightKey, right]) =>
      right.updatedAt - left.updatedAt || leftKey.localeCompare(rightKey),
  );
  const retained = new Set(inactive.slice(0, maximum).map(([key]) => key));
  return Object.fromEntries(
    Object.entries(entries).filter(
      ([key, entry]) => !isInactive(entry) || retained.has(key),
    ),
  );
}
