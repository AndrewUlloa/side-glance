import type { SideGlanceEventKind } from "../core/protocol.ts";
import {
  adapterRecord,
  buildAdapterEvent,
  providerSessionId,
  stringValue,
} from "./shared.ts";
import type { AdapterContext, AdapterResult } from "./types.ts";

const CODEX_EVENTS: Readonly<Record<string, SideGlanceEventKind>> = {
  SessionStart: "session.started",
  UserPromptSubmit: "turn.started",
  PermissionRequest: "attention.waiting",
  Stop: "turn.completed",
  SessionEnd: "session.ended",
};

export function adaptCodexHook(
  payloadValue: unknown,
  context: AdapterContext,
): AdapterResult {
  const payload = adapterRecord(payloadValue, "Codex");
  const hookName = stringValue(payload.hook_event_name);
  const kind = hookName ? CODEX_EVENTS[hookName] : undefined;
  if (!kind) return undefined;

  return buildAdapterEvent({
    source: "codex",
    sessionId: providerSessionId(payload, context, "Codex"),
    kind,
    context,
    ...(hookName === "Stop" ? { confidence: "heuristic" as const } : {}),
    ...(stringValue(payload.turn_id)
      ? { turnId: stringValue(payload.turn_id) }
      : {}),
    ...(hookName === "SessionEnd" && stringValue(payload.reason)
      ? { reason: stringValue(payload.reason) }
      : {}),
  });
}
