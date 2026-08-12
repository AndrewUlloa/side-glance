import type { SignalEventKind } from "../core/protocol.ts";
import {
  adapterRecord,
  buildAdapterEvent,
  providerSessionId,
  stringValue,
} from "./shared.ts";
import type { AdapterContext, AdapterResult } from "./types.ts";

const CLAUDE_EVENTS: Readonly<Record<string, SignalEventKind>> = {
  SessionStart: "session.started",
  UserPromptSubmit: "turn.started",
  PermissionRequest: "attention.waiting",
  Stop: "turn.completed",
  StopFailure: "turn.failed",
  SessionEnd: "session.ended",
};

export function adaptClaudeHook(
  payloadValue: unknown,
  context: AdapterContext,
): AdapterResult {
  const payload = adapterRecord(payloadValue, "Claude");
  const hookName = stringValue(payload.hook_event_name);
  let kind = hookName ? CLAUDE_EVENTS[hookName] : undefined;
  if (hookName === "Notification") {
    const notificationType = stringValue(payload.notification_type);
    kind = ["permission_prompt", "idle_prompt"].includes(notificationType ?? "")
      ? "attention.waiting"
      : undefined;
  }
  if (!kind) return undefined;

  return buildAdapterEvent({
    source: "claude",
    sessionId: providerSessionId(payload, context, "Claude"),
    kind,
    context,
    ...(stringValue(payload.turn_id)
      ? { turnId: stringValue(payload.turn_id) }
      : {}),
    ...(hookName === "SessionEnd" && stringValue(payload.reason)
      ? { reason: stringValue(payload.reason) }
      : {}),
  });
}
