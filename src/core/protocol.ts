export const SIDE_GLANCE_PROTOCOL_VERSION = 1 as const;

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
  leaseExpiresAt?: number;
  updatedAt: number;
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
  ownerKey?: string;
  tmuxSnapshot?: SideGlanceTmuxSnapshot;
}

export interface SideGlanceState {
  schemaVersion: 1;
  sessions: Record<string, SideGlanceSessionState>;
  surfaces: Record<string, SideGlanceSurfaceState>;
  seenEventIds: string[];
}

export function sessionKey(source: SideGlanceSource, sessionId: string): string {
  return `${source}:${sessionId}`;
}
