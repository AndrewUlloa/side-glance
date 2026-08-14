import {
  sessionKey,
  type SideGlanceEvent,
  type SideGlancePhase,
  type SideGlanceSessionState,
  type SideGlanceState,
} from "./protocol.ts";
import { compactSideGlanceState } from "./compact.ts";

const MAX_SEEN_EVENT_IDS = 4_096;

export function createSideGlanceState(): SideGlanceState {
  return {
    schemaVersion: 1,
    sessions: {},
    surfaces: {},
    seenEventIds: [],
  };
}

export function reduceSideGlanceEvent(
  state: SideGlanceState,
  event: SideGlanceEvent,
): SideGlanceState {
  if (state.seenEventIds.includes(event.eventId)) {
    return state;
  }

  const key = sessionKey(event.source, event.sessionId);
  const current = state.sessions[key];
  if (current && event.occurredAt < current.updatedAt) {
    return state;
  }
  if (
    current &&
    event.generation !== undefined &&
    event.generation < current.generation
  ) {
    return state;
  }
  if (
    current?.turnId &&
    event.turnId &&
    event.turnId !== current.turnId &&
    isTurnScopedFollowUp(event.kind)
  ) {
    return state;
  }

  const generation = nextGeneration(current, event);
  const phase = phaseFor(event.kind);
  const startedAt =
    event.kind === "session.started" || event.kind === "turn.started"
      ? event.occurredAt
      : current?.startedAt;
  const nextSession: SideGlanceSessionState = {
    source: event.source,
    sessionId: event.sessionId,
    phase,
    generation,
    ...(event.turnId ?? current?.turnId
      ? { turnId: event.turnId ?? current?.turnId }
      : {}),
    ...(event.reason ? { reason: event.reason } : {}),
    confidence: event.confidence ?? current?.confidence ?? "heuristic",
    ...(event.target ?? current?.target
      ? { target: event.target ?? current?.target }
      : {}),
    ...(startedAt !== undefined ? { startedAt } : {}),
    updatedAt: event.occurredAt,
  };

  return compactSideGlanceState({
    ...state,
    sessions: {
      ...state.sessions,
      [key]: nextSession,
    },
    seenEventIds: [...state.seenEventIds, event.eventId].slice(
      -MAX_SEEN_EVENT_IDS,
    ),
  });
}

function nextGeneration(
  current: SideGlanceSessionState | undefined,
  event: SideGlanceEvent,
): number {
  if (event.generation !== undefined) {
    return event.generation;
  }
  if (event.kind === "turn.started") {
    return (current?.generation ?? 0) + 1;
  }
  return current?.generation ?? 0;
}

function phaseFor(kind: SideGlanceEvent["kind"]): SideGlancePhase {
  switch (kind) {
    case "session.started":
    case "turn.started":
    case "attention.acknowledged":
      return "working";
    case "attention.waiting":
      return "waiting";
    case "turn.completed":
      return "completed";
    case "turn.failed":
    case "turn.cancelled":
      return "failed";
    case "session.ended":
      return "inactive";
  }
}

function isTurnScopedFollowUp(kind: SideGlanceEvent["kind"]): boolean {
  return [
    "attention.waiting",
    "attention.acknowledged",
    "turn.completed",
    "turn.failed",
    "turn.cancelled",
  ].includes(kind);
}
