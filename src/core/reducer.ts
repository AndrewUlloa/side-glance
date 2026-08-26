import {
  SIDE_GLANCE_ACTIVE_WORK_LIMIT,
  SIDE_GLANCE_BACKGROUND_OVERFLOW_WORK,
  SIDE_GLANCE_CRON_OVERFLOW_WORK,
  SIDE_GLANCE_SUBAGENT_OVERFLOW_WORK,
  sessionKey,
  type SideGlanceEvent,
  type SideGlancePhase,
  type SideGlanceSessionState,
  type SideGlanceState,
  type SideGlanceWorkRef,
} from "./protocol.ts";
import { compactSideGlanceState } from "./compact.ts";
import {
  createDurationProfile,
  eligibleDurationSample,
  updateDurationProfile,
} from "./duration-profile.ts";

const MAX_SEEN_EVENT_IDS = 4_096;
export const SIDE_GLANCE_LEASE_TTL_MS = 30 * 60 * 1_000;

export function createSideGlanceState(): SideGlanceState {
  return {
    schemaVersion: 2,
    sessions: {},
    surfaces: {},
    seenEventIds: [],
    durationProfiles: {},
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
  if (current?.phase === "inactive") {
    const canReactivate =
      event.kind === "session.started" ||
      (current.endedAt === undefined && event.kind === "turn.started");
    if (!canReactivate) return state;
  }

  const generation = nextGeneration(current, event);
  const { activeWork, activeWorkUpdatedAt } = nextActiveWork(current, event);
  const phase = phaseFor(current, event, activeWork);
  const consumesCompletedResponse =
    current?.completedAt !== undefined &&
    (event.kind === "turn.started" || event.kind === "attention.acknowledged");
  const responseEwmaSeconds = nextResponseEwmaSeconds(current, event);
  const startedAt = nextStartedAt(current, event, consumesCompletedResponse);
  const completedAt = nextCompletedAt(
    current,
    event,
    consumesCompletedResponse,
    phase,
  );
  const priorDurationProfile =
    state.durationProfiles[event.source] ?? createDurationProfile();
  const effectiveTurnId = event.turnId ?? current?.turnId;
  const durationSampleKey = semanticTurnKey(generation, effectiveTurnId);
  const retainedCompletionCeiling =
    current?.completionSnapshotKey === durationSampleKey
      ? current.completionCeilingSeconds
      : undefined;
  const completionSnapshotKey =
    phase === "completed"
      ? durationSampleKey
      : current?.completionSnapshotKey === durationSampleKey
        ? current.completionSnapshotKey
        : undefined;
  const completionCeilingSeconds =
    phase === "completed"
      ? (retainedCompletionCeiling ?? priorDurationProfile.ceilingSeconds)
      : retainedCompletionCeiling;
  const durationSeconds =
    phase === "completed" && current?.startedAt !== undefined
      ? (event.occurredAt - current.startedAt) / 1_000
      : undefined;
  const effectiveConfidence =
    event.confidence ?? current?.confidence ?? "heuristic";
  const shouldTrainDuration =
    event.kind === "turn.completed" &&
    phase === "completed" &&
    effectiveConfidence !== "notification" &&
    current?.durationSampleKey !== durationSampleKey &&
    durationSeconds !== undefined &&
    eligibleDurationSample(durationSeconds);
  const nextSession: SideGlanceSessionState = {
    source: event.source,
    sessionId: event.sessionId,
    phase,
    generation,
    ...(effectiveTurnId ? { turnId: effectiveTurnId } : {}),
    ...(event.wrapperSessionId ?? current?.wrapperSessionId
      ? { wrapperSessionId: event.wrapperSessionId ?? current?.wrapperSessionId }
      : {}),
    ...(event.reason ? { reason: event.reason } : {}),
    confidence: effectiveConfidence,
    ...(event.target ?? current?.target
      ? { target: event.target ?? current?.target }
      : {}),
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(completedAt !== undefined ? { completedAt } : {}),
    ...(responseEwmaSeconds !== undefined ? { responseEwmaSeconds } : {}),
    ...(completionCeilingSeconds !== undefined
      ? { completionCeilingSeconds }
      : {}),
    ...(completionSnapshotKey !== undefined ? { completionSnapshotKey } : {}),
    ...(event.kind !== "session.ended" && activeWork.length > 0
      ? { activeWork }
      : event.kind !== "session.ended" && current?.activeWork !== undefined
        ? { activeWork }
        : {}),
    ...(event.kind !== "session.ended" && activeWorkUpdatedAt !== undefined
      ? { activeWorkUpdatedAt }
      : {}),
    ...(event.kind !== "session.ended" &&
    (shouldTrainDuration || current?.durationSampleKey !== undefined)
      ? {
          durationSampleKey: shouldTrainDuration
            ? durationSampleKey
            : current?.durationSampleKey,
        }
      : {}),
    ...(event.kind === "session.ended" && !isManualReset(event.reason)
      ? { endedAt: event.occurredAt }
      : event.kind !== "session.started" && current?.endedAt !== undefined
        ? { endedAt: current.endedAt }
        : {}),
    ...(phase !== "inactive"
      ? {
          leaseExpiresAt: Math.min(
            Number.MAX_SAFE_INTEGER,
            event.occurredAt + SIDE_GLANCE_LEASE_TTL_MS,
          ),
        }
      : {}),
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
    durationProfiles: shouldTrainDuration
      ? {
          ...state.durationProfiles,
          [event.source]: updateDurationProfile(
            priorDurationProfile,
            durationSeconds,
          ),
        }
      : state.durationProfiles,
  });
}

function isManualReset(reason: string | undefined): boolean {
  return reason === "manual-reset" || reason === "manual-reset-all";
}

function nextStartedAt(
  current: SideGlanceSessionState | undefined,
  event: SideGlanceEvent,
  consumesCompletedResponse: boolean,
): number | undefined {
  if (event.kind === "session.started") {
    return current?.activeWork?.length ? current.startedAt : undefined;
  }
  if (event.kind === "turn.started" || consumesCompletedResponse) {
    return event.occurredAt;
  }
  return current?.startedAt;
}

function nextCompletedAt(
  current: SideGlanceSessionState | undefined,
  event: SideGlanceEvent,
  consumesCompletedResponse: boolean,
  phase: SideGlancePhase,
): number | undefined {
  if (event.kind === "turn.completed") {
    return phase === "completed" ? event.occurredAt : undefined;
  }
  if (
    consumesCompletedResponse ||
    event.kind === "session.started" ||
    event.kind === "turn.failed" ||
    event.kind === "turn.cancelled" ||
    event.kind === "session.ended" ||
    event.kind === "work.started"
  ) {
    return undefined;
  }
  return current?.completedAt;
}

function nextResponseEwmaSeconds(
  current: SideGlanceSessionState | undefined,
  event: SideGlanceEvent,
): number | undefined {
  if (event.kind === "session.started") return undefined;
  if (
    current?.completedAt === undefined ||
    (event.kind !== "turn.started" && event.kind !== "attention.acknowledged")
  ) {
    return current?.responseEwmaSeconds;
  }

  const responseSeconds = Math.max(
    0,
    (event.occurredAt - current.completedAt) / 1_000,
  );
  const previous = current.responseEwmaSeconds ?? 120;
  return Number((0.4 * responseSeconds + 0.6 * previous).toFixed(6));
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

function phaseFor(
  current: SideGlanceSessionState | undefined,
  event: SideGlanceEvent,
  activeWork: readonly SideGlanceWorkRef[],
): SideGlancePhase {
  if (
    event.kind === "turn.completed" &&
    current !== undefined &&
    event.occurredAt === current.updatedAt &&
    current.phase !== "completed"
  ) {
    return current.phase;
  }
  if (
    event.kind === "turn.completed" &&
    current?.activeWorkUpdatedAt !== undefined &&
    event.occurredAt <= current.activeWorkUpdatedAt
  ) {
    return current.phase === "waiting" || current.phase === "failed"
      ? current.phase
      : "working";
  }
  if (["work.started", "work.finished"].includes(event.kind)) {
    return current?.phase === "waiting" || current?.phase === "failed"
      ? current.phase
      : "working";
  }
  if (event.kind === "turn.completed" && activeWork.length > 0) {
    return current?.phase === "waiting" || current?.phase === "failed"
      ? current.phase
      : "working";
  }
  switch (event.kind) {
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
    case "work.started":
    case "work.finished":
      return "working";
  }
}

function nextActiveWork(
  current: SideGlanceSessionState | undefined,
  event: SideGlanceEvent,
): { activeWork: SideGlanceWorkRef[]; activeWorkUpdatedAt?: number } {
  if (event.kind === "session.ended") {
    return { activeWork: [] };
  }

  const currentWork = current?.activeWork ?? [];
  const workObservedAt = current?.activeWorkUpdatedAt;
  if (event.kind === "session.started") {
    return {
      activeWork: currentWork,
      ...(workObservedAt !== undefined
        ? { activeWorkUpdatedAt: workObservedAt }
        : {}),
    };
  }
  if (event.kind === "work.started" && event.work) {
    const activeWork = boundActiveWork([...currentWork, event.work]);
    return { activeWork, activeWorkUpdatedAt: event.occurredAt };
  }
  let reconciledWork = currentWork;
  let reconciledAt = workObservedAt;
  if (event.kind === "work.finished" && event.work) {
    if (
      workObservedAt !== undefined &&
      event.occurredAt < workObservedAt
    ) {
      return { activeWork: currentWork, activeWorkUpdatedAt: workObservedAt };
    }
    reconciledWork = currentWork.filter(({ id }) => id !== event.work?.id);
    reconciledAt = event.occurredAt;
  }
  if (event.activeWork !== undefined) {
    if (
      event.activeWork.length === 0 &&
      reconciledAt !== undefined &&
      event.occurredAt <= reconciledAt
    ) {
      return { activeWork: reconciledWork, activeWorkUpdatedAt: reconciledAt };
    }
    if (
      event.activeWork.length > 0 &&
      reconciledAt !== undefined &&
      event.occurredAt === reconciledAt
    ) {
      return {
        activeWork: boundActiveWork([...reconciledWork, ...event.activeWork]),
        activeWorkUpdatedAt: event.occurredAt,
      };
    }
    const trackedSubagents = reconciledWork.filter(
      ({ kind }) => kind === "subagent",
    );
    const activeWork = boundActiveWork([
      ...trackedSubagents,
      ...event.activeWork,
    ]);
    return {
      activeWork,
      ...(event.activeWork.length > 0
        ? { activeWorkUpdatedAt: event.occurredAt }
        : reconciledAt !== undefined
          ? { activeWorkUpdatedAt: reconciledAt }
          : {}),
    };
  }
  return {
    activeWork: reconciledWork,
    ...(reconciledAt !== undefined
      ? { activeWorkUpdatedAt: reconciledAt }
      : {}),
  };
}

function deduplicateWork(work: readonly SideGlanceWorkRef[]): SideGlanceWorkRef[] {
  return work.filter(
    (candidate, index, values) =>
      values.findIndex(({ id }) => id === candidate.id) === index,
  );
}

function boundActiveWork(work: readonly SideGlanceWorkRef[]): SideGlanceWorkRef[] {
  const deduplicated = deduplicateWork(work);
  if (deduplicated.length <= SIDE_GLANCE_ACTIVE_WORK_LIMIT) {
    return deduplicated;
  }
  const overflowIds = new Set([
    SIDE_GLANCE_SUBAGENT_OVERFLOW_WORK.id,
    SIDE_GLANCE_BACKGROUND_OVERFLOW_WORK.id,
    SIDE_GLANCE_CRON_OVERFLOW_WORK.id,
  ]);
  const realWork = deduplicated.filter(({ id }) => !overflowIds.has(id));
  const overflowKinds = new Set<SideGlanceWorkRef["kind"]>(
    deduplicated
      .filter(({ id }) => overflowIds.has(id))
      .map(({ kind }) => kind),
  );
  let kept: SideGlanceWorkRef[] = [];
  while (true) {
    const available = SIDE_GLANCE_ACTIVE_WORK_LIMIT - overflowKinds.size;
    kept = realWork.slice(0, Math.max(0, available));
    const previousSize = overflowKinds.size;
    for (const dropped of realWork.slice(kept.length)) {
      overflowKinds.add(dropped.kind);
    }
    if (overflowKinds.size === previousSize) break;
  }
  return [
    ...kept,
    ...[...overflowKinds].map((kind) => ({ ...overflowWorkForKind(kind) })),
  ].slice(0, SIDE_GLANCE_ACTIVE_WORK_LIMIT);
}

function overflowWorkForKind(
  kind: SideGlanceWorkRef["kind"],
): Readonly<SideGlanceWorkRef> {
  switch (kind) {
    case "subagent":
      return SIDE_GLANCE_SUBAGENT_OVERFLOW_WORK;
    case "background-task":
      return SIDE_GLANCE_BACKGROUND_OVERFLOW_WORK;
    case "session-cron":
      return SIDE_GLANCE_CRON_OVERFLOW_WORK;
  }
}

function semanticTurnKey(generation: number, turnId: string | undefined): string {
  return turnId ? `turn:${turnId}` : `generation:${generation}`;
}

function isTurnScopedFollowUp(kind: SideGlanceEvent["kind"]): boolean {
  return [
    "attention.waiting",
    "attention.acknowledged",
    "turn.completed",
    "turn.failed",
    "turn.cancelled",
    "work.started",
    "work.finished",
  ].includes(kind);
}
