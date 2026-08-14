import type { SideGlanceSessionState, SideGlanceState } from "./protocol.ts";

export interface SurfaceResolution {
  surfaceId: string;
  ownerKey: string;
  session: SideGlanceSessionState;
}

export function resolveSurface(
  state: SideGlanceState,
  surfaceId: string,
): SurfaceResolution | undefined {
  const candidates = Object.entries(state.sessions)
    .filter(
      ([, session]) =>
        session.phase !== "inactive" && session.target?.surfaceId === surfaceId,
    )
    .map(([ownerKey, session]) => ({ surfaceId, ownerKey, session }));

  candidates.sort((left, right) => {
    const attentionOrder =
      priorityFor(right.session.phase) - priorityFor(left.session.phase);
    if (attentionOrder !== 0) {
      return attentionOrder;
    }

    const recencyOrder = right.session.updatedAt - left.session.updatedAt;
    if (recencyOrder !== 0) {
      return recencyOrder;
    }

    return left.ownerKey.localeCompare(right.ownerKey);
  });

  return candidates[0];
}

function priorityFor(phase: SideGlanceSessionState["phase"]): number {
  switch (phase) {
    case "failed":
      return 4;
    case "waiting":
      return 3;
    case "completed":
      return 2;
    case "working":
      return 1;
    case "inactive":
      return 0;
  }
}
