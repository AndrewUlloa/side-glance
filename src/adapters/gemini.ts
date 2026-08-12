import type { SignalEventKind } from "../core/protocol.ts";
import {
  adapterRecord,
  buildAdapterEvent,
  providerSessionId,
  stringValue,
} from "./shared.ts";
import type { AdapterContext, AdapterResult } from "./types.ts";

const GEMINI_EVENTS: Readonly<Record<string, SignalEventKind>> = {
  SessionStart: "session.started",
  BeforeAgent: "turn.started",
  AfterAgent: "turn.completed",
  SessionEnd: "session.ended",
};

export function adaptGeminiHook(
  payloadValue: unknown,
  context: AdapterContext,
): AdapterResult {
  const payload = adapterRecord(payloadValue, "Gemini");
  const hookName = stringValue(payload.hook_event_name);
  let kind = hookName ? GEMINI_EVENTS[hookName] : undefined;
  if (
    hookName === "Notification" &&
    stringValue(payload.notification_type) === "ToolPermission"
  ) {
    kind = "attention.waiting";
  }
  if (!kind) return undefined;

  return buildAdapterEvent({
    source: "gemini",
    sessionId: providerSessionId(payload, context, "Gemini"),
    kind,
    context,
    ...(hookName === "SessionEnd" && stringValue(payload.reason)
      ? { reason: stringValue(payload.reason) }
      : {}),
  });
}
