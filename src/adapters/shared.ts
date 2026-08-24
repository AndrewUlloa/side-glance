import type {
  SideGlanceConfidence,
  SideGlanceEvent,
  SideGlanceEventKind,
  SideGlanceSource,
} from "../core/protocol.ts";
import { parseSideGlanceEvent } from "../core/validation.ts";
import type { AdapterContext } from "./types.ts";

export function adapterRecord(
  value: unknown,
  provider: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${provider} hook payload must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function providerSessionId(
  payload: Record<string, unknown>,
  context: AdapterContext,
  provider: string,
): string {
  const candidate =
    stringValue(payload.session_id) ??
    stringValue(payload.sessionId) ??
    stringValue(payload.sessionID) ??
    context.fallbackSessionId;
  if (!candidate) {
    throw new Error(`${provider} hook payload is missing its session ID.`);
  }
  return candidate;
}

export function buildAdapterEvent(options: {
  source: SideGlanceSource;
  sessionId: string;
  kind: SideGlanceEventKind;
  context: AdapterContext;
  confidence?: SideGlanceConfidence;
  turnId?: string;
  reason?: string;
}): SideGlanceEvent {
  return parseSideGlanceEvent({
    v: 1,
    eventId: options.context.eventId,
    source: options.source,
    sessionId: options.sessionId,
    kind: options.kind,
    occurredAt: options.context.occurredAt,
    ...(options.context.generation !== undefined
      ? { generation: options.context.generation }
      : {}),
    ...(options.turnId ? { turnId: options.turnId } : {}),
    ...(options.context.wrapperSessionId
      ? { wrapperSessionId: options.context.wrapperSessionId }
      : {}),
    ...(options.reason ? { reason: options.reason } : {}),
    confidence: options.confidence ?? "native",
    ...(options.context.target ? { target: options.context.target } : {}),
  });
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
