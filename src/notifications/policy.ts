import { createHash } from "node:crypto";

import type {
  SideGlanceEvent,
  SideGlanceEventKind,
  SideGlanceSource,
} from "../core/protocol.ts";

export const DEFAULT_NOTIFICATION_SOUND = "Glass";
export const MAX_NOTIFICATION_LABEL_CODE_POINTS = 48;
export const MAX_NOTIFICATION_SOUND_CODE_POINTS = 64;

const NOTIFICATION_KINDS = new Set<SideGlanceEventKind>([
  "attention.waiting",
  "turn.completed",
  "turn.failed",
  "turn.cancelled",
]);

const PROVIDER_NAMES: Record<SideGlanceSource, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
  opencode: "OpenCode",
  aider: "Aider",
  generic: "Agent",
};

export interface NotificationOptions {
  label?: string;
  sound?: string;
}

export interface NotificationRequest {
  title: string;
  body: string;
  sound: string;
}

export interface EventNotifier {
  notify(event: SideGlanceEvent): Promise<void>;
}

export function shouldNotifyForEvent(event: SideGlanceEvent): boolean {
  return (
    NOTIFICATION_KINDS.has(event.kind) &&
    !(event.kind === "turn.completed" && event.confidence === "heuristic")
  );
}

export function notificationRequestForEvent(
  event: SideGlanceEvent,
  options: NotificationOptions = {},
): NotificationRequest | undefined {
  if (!shouldNotifyForEvent(event)) return undefined;
  const phase = notificationPhase(event.kind);
  if (!phase) return undefined;

  const explicitLabel = options.label
    ? sanitizeNotificationLabel(options.label)
    : "";
  const label = explicitLabel || defaultSessionLabel(event.sessionId);
  const sound = options.sound
    ? sanitizeNotificationSound(options.sound)
    : DEFAULT_NOTIFICATION_SOUND;

  return {
    title: `Side Glance · ${PROVIDER_NAMES[event.source]} · ${phase}`,
    body: label,
    sound: sound || DEFAULT_NOTIFICATION_SOUND,
  };
}

export function sanitizeNotificationLabel(label: string): string {
  return sanitizeAndBound(label, MAX_NOTIFICATION_LABEL_CODE_POINTS);
}

export function sanitizeNotificationSound(sound: string): string {
  return sanitizeAndBound(sound, MAX_NOTIFICATION_SOUND_CODE_POINTS);
}

function defaultSessionLabel(sessionId: string): string {
  const digest = createHash("sha256").update(sessionId).digest("hex").slice(0, 8);
  return `Session ${digest}`;
}

function notificationPhase(kind: SideGlanceEventKind): string | undefined {
  switch (kind) {
    case "attention.waiting":
      return "Needs attention";
    case "turn.completed":
      return "Ready";
    case "turn.failed":
      return "Failed";
    case "turn.cancelled":
      return "Cancelled";
    case "session.started":
    case "turn.started":
    case "attention.acknowledged":
    case "session.ended":
      return undefined;
  }
}

function sanitizeAndBound(value: string, maximum: number): string {
  const normalized = [...value.normalize("NFC")]
    .map((character) => (isControlCharacter(character) ? " " : character))
    .join("")
    .replace(/\s+/gu, " ")
    .trim();
  return [...normalized].slice(0, maximum).join("");
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
}
