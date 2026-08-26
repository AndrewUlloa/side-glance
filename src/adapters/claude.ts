import {
  SIDE_GLANCE_ACTIVE_WORK_LIMIT,
  SIDE_GLANCE_BACKGROUND_OVERFLOW_WORK,
  SIDE_GLANCE_CRON_OVERFLOW_WORK,
  type SideGlanceEventKind,
  type SideGlanceWorkKind,
  type SideGlanceWorkRef,
} from "../core/protocol.ts";
import {
  adapterRecord,
  buildAdapterEvent,
  providerSessionId,
  stringValue,
} from "./shared.ts";
import type { AdapterContext, AdapterResult } from "./types.ts";

const CLAUDE_EVENTS: Readonly<Record<string, SideGlanceEventKind>> = {
  SessionStart: "session.started",
  UserPromptSubmit: "turn.started",
  PermissionRequest: "attention.waiting",
  Stop: "turn.completed",
  StopFailure: "turn.failed",
  SubagentStart: "work.started",
  SubagentStop: "work.finished",
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

  const work =
    hookName === "SubagentStart" || hookName === "SubagentStop"
      ? subagentWork(payload)
      : undefined;
  if (
    (hookName === "SubagentStart" || hookName === "SubagentStop") &&
    !work
  ) {
    return undefined;
  }
  const activeWork = ["Stop", "SubagentStop"].includes(hookName ?? "")
    ? activeWorkSnapshot(payload)
    : undefined;

  return buildAdapterEvent({
    source: "claude",
    sessionId: providerSessionId(payload, context, "Claude"),
    kind,
    context,
    ...(["Stop", "SubagentStop"].includes(hookName ?? "")
      ? { confidence: "heuristic" as const }
      : {}),
    ...(work ? { work } : {}),
    ...(activeWork !== undefined ? { activeWork } : {}),
    ...(stringValue(payload.turn_id)
      ? { turnId: stringValue(payload.turn_id) }
      : {}),
    ...(hookName === "SessionEnd" && stringValue(payload.reason)
      ? { reason: stringValue(payload.reason) }
      : {}),
  });
}

function subagentWork(
  payload: Record<string, unknown>,
): SideGlanceWorkRef | undefined {
  const agentId = boundedIdentifier(payload.agent_id, 151);
  return agentId
    ? { id: `subagent:${agentId}`, kind: "subagent" }
    : undefined;
}

function activeWorkSnapshot(
  payload: Record<string, unknown>,
): SideGlanceWorkRef[] | undefined {
  if (
    !Array.isArray(payload.background_tasks) ||
    !Array.isArray(payload.session_crons)
  ) {
    return undefined;
  }

  const sources: Array<{
    entries: unknown[];
    kind: SideGlanceWorkKind;
    prefix: string;
  }> = [
    {
      entries: payload.background_tasks,
      kind: "background-task",
      prefix: "background:",
    },
    {
      entries: payload.session_crons,
      kind: "session-cron",
      prefix: "cron:",
    },
  ];
  const parsed: SideGlanceWorkRef[] = [];

  for (const source of sources) {
    for (const entry of source.entries) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        return undefined;
      }
      const id = boundedIdentifier((entry as Record<string, unknown>).id, 140);
      if (!id) return undefined;
      parsed.push({ id: `${source.prefix}${id}`, kind: source.kind });
    }
  }

  const deduplicated = parsed.filter(
    (work, index, values) => values.findIndex(({ id }) => id === work.id) === index,
  );
  if (deduplicated.length <= SIDE_GLANCE_ACTIVE_WORK_LIMIT) return deduplicated;

  let realLimit = SIDE_GLANCE_ACTIVE_WORK_LIMIT - 1;
  let droppedKinds = new Set<SideGlanceWorkKind>();
  while (true) {
    droppedKinds = new Set(
      deduplicated.slice(realLimit).map(({ kind }) => kind),
    );
    const nextRealLimit = SIDE_GLANCE_ACTIVE_WORK_LIMIT - droppedKinds.size;
    if (nextRealLimit === realLimit) break;
    realLimit = nextRealLimit;
  }
  const overflow = [...droppedKinds].map((kind) =>
    kind === "background-task"
      ? { ...SIDE_GLANCE_BACKGROUND_OVERFLOW_WORK }
      : { ...SIDE_GLANCE_CRON_OVERFLOW_WORK },
  );
  return [...deduplicated.slice(0, realLimit), ...overflow];
}

function boundedIdentifier(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const characters = [...value];
  if (characters.length > maximum) return undefined;
  if (
    characters.some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    })
  ) {
    return undefined;
  }
  return value;
}
