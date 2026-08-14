import type { SideGlanceEventKind } from "../core/protocol.ts";
import {
  adapterRecord,
  buildAdapterEvent,
  providerSessionId,
  stringValue,
} from "./shared.ts";
import type { AdapterContext, AdapterResult } from "./types.ts";

const OPENCODE_EVENTS: Readonly<Record<string, SideGlanceEventKind>> = {
  "session.created": "session.started",
  "session.idle": "turn.completed",
  "session.error": "turn.failed",
  "session.deleted": "session.ended",
  "permission.asked": "attention.waiting",
  "permission.replied": "attention.acknowledged",
};

export function adaptOpenCodeEvent(
  payloadValue: unknown,
  context: AdapterContext,
): AdapterResult {
  const payload = adapterRecord(payloadValue, "OpenCode");
  const type = stringValue(payload.type);
  const properties = adapterRecord(payload.properties ?? {}, "OpenCode properties");
  let kind = type ? OPENCODE_EVENTS[type] : undefined;
  if (type === "session.status") {
    const status = adapterRecord(properties.status ?? {}, "OpenCode session status");
    kind = stringValue(status.type) === "busy" ? "turn.started" : undefined;
  }
  if (!kind) return undefined;

  const info = adapterRecord(properties.info ?? {}, "OpenCode session info");
  const sessionPayload = {
    ...properties,
    sessionID:
      stringValue(properties.sessionID) ??
      stringValue(properties.sessionId) ??
      stringValue(info.id),
  };
  return buildAdapterEvent({
    source: "opencode",
    sessionId: providerSessionId(sessionPayload, context, "OpenCode"),
    kind,
    context,
    ...(type === "session.error" ? { reason: "session.error" } : {}),
  });
}
