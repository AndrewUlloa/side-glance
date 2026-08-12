export const SIGNAL_PROTOCOL_VERSION = 1 as const;

export type SignalSource =
  | "claude"
  | "codex"
  | "gemini"
  | "opencode"
  | "aider"
  | "generic";

export type SignalEventKind =
  | "session.started"
  | "turn.started"
  | "attention.waiting"
  | "attention.acknowledged"
  | "turn.completed"
  | "turn.failed"
  | "turn.cancelled"
  | "session.ended";

export type SignalPhase =
  | "inactive"
  | "working"
  | "waiting"
  | "completed"
  | "failed";

export type SignalConfidence =
  | "native"
  | "notification"
  | "wrapper"
  | "heuristic";

export interface SignalTarget {
  surfaceId: string;
  tty?: string;
  tmuxPane?: string;
}

export interface SignalEvent {
  v: typeof SIGNAL_PROTOCOL_VERSION;
  eventId: string;
  source: SignalSource;
  sessionId: string;
  kind: SignalEventKind;
  occurredAt: number;
  generation?: number;
  turnId?: string;
  reason?: string;
  confidence?: SignalConfidence;
  target?: SignalTarget;
}

export interface SignalSessionState {
  source: SignalSource;
  sessionId: string;
  phase: SignalPhase;
  generation: number;
  turnId?: string;
  reason?: string;
  confidence: SignalConfidence;
  target?: SignalTarget;
  startedAt?: number;
  updatedAt: number;
}

export interface SignalState {
  schemaVersion: 1;
  sessions: Record<string, SignalSessionState>;
  seenEventIds: string[];
}

export function sessionKey(source: SignalSource, sessionId: string): string {
  return `${source}:${sessionId}`;
}
