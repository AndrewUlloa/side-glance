import {
  adapterRecord,
  buildAdapterEvent,
  providerSessionId,
  stringValue,
} from "./shared.ts";
import type { AdapterContext, AdapterResult } from "./types.ts";

export function adaptAiderNotification(
  payloadValue: unknown,
  context: AdapterContext,
): AdapterResult {
  const payload = adapterRecord(payloadValue, "Aider");
  if (stringValue(payload.event) !== "response-complete") return undefined;

  return buildAdapterEvent({
    source: "aider",
    sessionId: providerSessionId(payload, context, "Aider"),
    kind: "turn.completed",
    context,
    confidence: "notification",
  });
}
