export const SIDE_GLANCE_PROTOCOL_VERSION = 1 as const;
export const SIDE_GLANCE_ACTIVE_WORK_LIMIT = 32;

export type SideGlanceSource =
  | "claude"
  | "codex"
  | "gemini"
  | "opencode"
  | "aider"
  | "generic";

export type SideGlanceEventKind =
  | "session.started"
  | "turn.started"
  | "attention.waiting"
  | "attention.acknowledged"
  | "turn.completed"
  | "turn.failed"
  | "turn.cancelled"
  | "work.started"
  | "work.finished"
  | "session.ended";

export type SideGlancePhase =
  | "inactive"
  | "working"
  | "waiting"
  | "completed"
  | "failed";

export type SideGlanceConfidence =
  | "native"
  | "notification"
  | "wrapper"
  | "heuristic";

export interface SideGlanceTarget {
  surfaceId: string;
  tty?: string;
  tmuxPane?: string;
}

export type SideGlanceWorkKind =
  | "subagent"
  | "background-task"
  | "session-cron";

export interface SideGlanceWorkRef {
  id: string;
  kind: SideGlanceWorkKind;
}

export const SIDE_GLANCE_SUBAGENT_OVERFLOW_WORK: Readonly<SideGlanceWorkRef> = {
  id: "subagent:overflow",
  kind: "subagent",
};

export const SIDE_GLANCE_BACKGROUND_OVERFLOW_WORK: Readonly<SideGlanceWorkRef> = {
  id: "background:overflow",
  kind: "background-task",
};

export const SIDE_GLANCE_CRON_OVERFLOW_WORK: Readonly<SideGlanceWorkRef> = {
  id: "cron:overflow",
  kind: "session-cron",
};

export interface SideGlanceEvent {
  v: typeof SIDE_GLANCE_PROTOCOL_VERSION;
  eventId: string;
  source: SideGlanceSource;
  sessionId: string;
  kind: SideGlanceEventKind;
  occurredAt: number;
  generation?: number;
  turnId?: string;
  wrapperSessionId?: string;
  reason?: string;
  confidence?: SideGlanceConfidence;
  target?: SideGlanceTarget;
  work?: SideGlanceWorkRef;
  activeWork?: SideGlanceWorkRef[];
}

export interface SideGlanceSessionState {
  source: SideGlanceSource;
  sessionId: string;
  phase: SideGlancePhase;
  generation: number;
  turnId?: string;
  wrapperSessionId?: string;
  reason?: string;
  confidence: SideGlanceConfidence;
  target?: SideGlanceTarget;
  startedAt?: number;
  completedAt?: number;
  responseEwmaSeconds?: number;
  completionCeilingSeconds?: number;
  completionSnapshotKey?: string;
  activeWork?: SideGlanceWorkRef[];
  activeWorkUpdatedAt?: number;
  durationSampleKey?: string;
  endedAt?: number;
  leaseExpiresAt?: number;
  updatedAt: number;
}

export interface SideGlanceDurationProfile {
  algorithmVersion: 1;
  samplesSeconds: number[];
  ceilingSeconds: number;
}

export interface SideGlanceTmuxOptionSnapshot {
  name:
    | "window-status-style"
    | "window-status-current-style"
    | "window-status-format"
    | "window-status-current-format";
  local: boolean;
  value?: string;
}

export interface SideGlanceTmuxSnapshot {
  windowId: string;
  options: SideGlanceTmuxOptionSnapshot[];
}

export interface SideGlanceSurfaceState {
  surfaceId: string;
  target: SideGlanceTarget;
  phase: SideGlancePhase;
  generation: number;
  updatedAt: number;
  terminalPainted: boolean;
  terminalTitlePainted?: boolean;
  ownerKey?: string;
  tmuxSnapshot?: SideGlanceTmuxSnapshot;
}

export interface SideGlanceState {
  schemaVersion: 2;
  sessions: Record<string, SideGlanceSessionState>;
  surfaces: Record<string, SideGlanceSurfaceState>;
  seenEventIds: string[];
  durationProfiles: Partial<Record<SideGlanceSource, SideGlanceDurationProfile>>;
}

export function sessionKey(source: SideGlanceSource, sessionId: string): string {
  return `${source}:${sessionId}`;
}
