import {
  SIDE_GLANCE_PROTOCOL_VERSION,
  type SideGlanceConfidence,
  type SideGlanceEvent,
  type SideGlanceEventKind,
  type SideGlanceSource,
  type SideGlanceTarget,
} from "./protocol.ts";

const SOURCES = new Set<SideGlanceSource>([
  "claude",
  "codex",
  "gemini",
  "opencode",
  "aider",
  "generic",
]);
const EVENT_KINDS = new Set<SideGlanceEventKind>([
  "session.started",
  "turn.started",
  "attention.waiting",
  "attention.acknowledged",
  "turn.completed",
  "turn.failed",
  "turn.cancelled",
  "session.ended",
]);
const CONFIDENCES = new Set<SideGlanceConfidence>([
  "native",
  "notification",
  "wrapper",
  "heuristic",
]);
const EVENT_FIELDS = new Set([
  "v",
  "eventId",
  "source",
  "sessionId",
  "kind",
  "occurredAt",
  "generation",
  "turnId",
  "reason",
  "confidence",
  "target",
]);
const TARGET_FIELDS = new Set(["surfaceId", "tty", "tmuxPane"]);

export function parseSideGlanceEvent(value: unknown): SideGlanceEvent {
  const event = requireRecord(value, "Side Glance event");
  rejectUnknownFields(event, EVENT_FIELDS, "Side Glance event");

  if (event.v !== SIDE_GLANCE_PROTOCOL_VERSION) {
    throw new Error(`Side Glance event v must be ${SIDE_GLANCE_PROTOCOL_VERSION}.`);
  }
  const source = requireEnum(event.source, SOURCES, "source");
  const kind = requireEnum(event.kind, EVENT_KINDS, "kind");
  const parsed: SideGlanceEvent = {
    v: SIDE_GLANCE_PROTOCOL_VERSION,
    eventId: requireText(event.eventId, "eventId", 160),
    source,
    sessionId: requireText(event.sessionId, "sessionId", 256),
    kind,
    occurredAt: requireFiniteNumber(event.occurredAt, "occurredAt", 0),
  };

  if (event.generation !== undefined) {
    if (!Number.isSafeInteger(event.generation) || Number(event.generation) < 0) {
      throw new Error("Side Glance event generation must be a non-negative safe integer.");
    }
    parsed.generation = Number(event.generation);
  }
  if (event.turnId !== undefined) {
    parsed.turnId = requireText(event.turnId, "turnId", 256);
  }
  if (event.reason !== undefined) {
    parsed.reason = requireText(event.reason, "reason", 256);
  }
  if (event.confidence !== undefined) {
    parsed.confidence = requireEnum(
      event.confidence,
      CONFIDENCES,
      "confidence",
    );
  }
  if (event.target !== undefined) {
    parsed.target = parseTarget(event.target);
  }

  return parsed;
}

export function parseSideGlanceSource(value: string): SideGlanceSource {
  return requireEnum(value, SOURCES, "source");
}

function parseTarget(value: unknown): SideGlanceTarget {
  const target = requireRecord(value, "Side Glance target");
  rejectUnknownFields(target, TARGET_FIELDS, "Side Glance target");
  return {
    surfaceId: requireText(target.surfaceId, "target.surfaceId", 512),
    ...(target.tty !== undefined
      ? { tty: requireText(target.tty, "target.tty", 1_024) }
      : {}),
    ...(target.tmuxPane !== undefined
      ? { tmuxPane: requireText(target.tmuxPane, "target.tmuxPane", 64) }
      : {}),
  };
}

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  const unknown = Object.keys(value).filter((field) => !allowed.has(field));
  if (unknown.length > 0) {
    throw new Error(`${label} contains unknown field: ${unknown[0]}.`);
  }
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  label: string,
): T {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new Error(`${label} is not a supported value.`);
  }
  return value as T;
}

function requireText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if ([...value].length > maximum) {
    throw new Error(`${label} exceeds ${maximum} characters.`);
  }
  if ([...value].some(isControlCharacter)) {
    throw new Error(`${label} may not contain control characters.`);
  }
  return value;
}

function requireFiniteNumber(
  value: unknown,
  label: string,
  minimum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${label} must be a finite number at least ${minimum}.`);
  }
  return value;
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
}
