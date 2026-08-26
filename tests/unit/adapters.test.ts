import assert from "node:assert/strict";
import test from "node:test";

import { adaptClaudeHook } from "../../src/adapters/claude.ts";
import { adaptCodexHook } from "../../src/adapters/codex.ts";
import { adaptGeminiHook } from "../../src/adapters/gemini.ts";
import { adaptOpenCodeEvent } from "../../src/adapters/opencode.ts";
import type { AdapterContext } from "../../src/adapters/types.ts";

const context: AdapterContext = {
  eventId: "normalized-1",
  occurredAt: 5_000,
  generation: 3,
  target: { surfaceId: "tty:/dev/ttys001", tty: "/dev/ttys001" },
};

test("maps Claude lifecycle, waiting, failure, and teardown hooks", () => {
  const cases = [
    ["SessionStart", "session.started"],
    ["UserPromptSubmit", "turn.started"],
    ["PermissionRequest", "attention.waiting"],
    ["Stop", "turn.completed"],
    ["StopFailure", "turn.failed"],
    ["SessionEnd", "session.ended"],
  ] as const;

  for (const [hookEventName, expectedKind] of cases) {
    const result = adaptClaudeHook(
      {
        hook_event_name: hookEventName,
        session_id: "claude-session",
        prompt: "private prompt must disappear",
        reason: hookEventName === "SessionEnd" ? "logout" : undefined,
      },
      context,
    );
    assert.equal(result?.kind, expectedKind);
    assert.equal(result?.source, "claude");
    assert.equal(result?.sessionId, "claude-session");
    assert.equal(JSON.stringify(result).includes("private prompt"), false);
  }

  assert.equal(
    adaptClaudeHook(
      {
        hook_event_name: "Notification",
        notification_type: "permission_prompt",
        session_id: "claude-session",
      },
      context,
    )?.kind,
    "attention.waiting",
  );
});

test("maps Claude subagent work and bounded aggregate snapshots without content", () => {
  const started = adaptClaudeHook(
    {
      hook_event_name: "SubagentStart",
      session_id: "claude-session",
      agent_id: "agent-7",
      agent_type: "Explore",
      prompt: "private subagent prompt",
    },
    context,
  );
  const stopped = adaptClaudeHook(
    {
      hook_event_name: "SubagentStop",
      session_id: "claude-session",
      agent_id: "agent-7",
      background_tasks: [],
      session_crons: [],
      transcript_path: "/private/transcript.jsonl",
    },
    context,
  );
  const parentStop = adaptClaudeHook(
    {
      hook_event_name: "Stop",
      session_id: "claude-session",
      background_tasks: [
        {
          id: "task-9",
          type: "shell",
          status: "running",
          description: "private command description",
        },
      ],
      session_crons: [
        { id: "cron-4", schedule: "* * * * *", prompt: "private cron prompt" },
      ],
    },
    context,
  );

  assert.deepEqual(started?.work, { id: "subagent:agent-7", kind: "subagent" });
  assert.equal(started?.kind, "work.started");
  assert.deepEqual(stopped?.work, { id: "subagent:agent-7", kind: "subagent" });
  assert.equal(stopped?.kind, "work.finished");
  assert.equal(stopped?.confidence, "heuristic");
  assert.deepEqual(stopped?.activeWork, []);
  assert.deepEqual(parentStop?.activeWork, [
    { id: "background:task-9", kind: "background-task" },
    { id: "cron:cron-4", kind: "session-cron" },
  ]);
  const serialized = JSON.stringify([started, stopped, parentStop]);
  for (const privateValue of [
    "private subagent prompt",
    "/private/transcript.jsonl",
    "private command description",
    "private cron prompt",
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test("distinguishes unknown Claude registries from explicit empty work", () => {
  const missing = adaptClaudeHook(
    { hook_event_name: "Stop", session_id: "claude-session" },
    context,
  );
  const malformed = adaptClaudeHook(
    {
      hook_event_name: "Stop",
      session_id: "claude-session",
      background_tasks: "unknown",
      session_crons: [],
    },
    context,
  );
  const empty = adaptClaudeHook(
    {
      hook_event_name: "Stop",
      session_id: "claude-session",
      background_tasks: [],
      session_crons: [],
    },
    context,
  );

  assert.equal(missing?.activeWork, undefined);
  assert.equal(malformed?.activeWork, undefined);
  assert.deepEqual(empty?.activeWork, []);
});

test("bounds Claude aggregate snapshots and rejects unsafe work identifiers", () => {
  const overflow = adaptClaudeHook(
    {
      hook_event_name: "Stop",
      session_id: "claude-session",
      background_tasks: Array.from({ length: 40 }, (_, index) => ({
        id: `task-${index}`,
      })),
      session_crons: [],
    },
    context,
  );
  const malformed = adaptClaudeHook(
    {
      hook_event_name: "SubagentStart",
      session_id: "claude-session",
      agent_id: "unsafe\u001b[31m",
    },
    context,
  );

  assert.equal(overflow?.activeWork?.length, 32);
  assert.deepEqual(overflow?.activeWork?.at(-1), {
    id: "background:overflow",
    kind: "background-task",
  });
  assert.equal(malformed, undefined);

  const cronOverflow = adaptClaudeHook(
    {
      hook_event_name: "Stop",
      session_id: "claude-session",
      background_tasks: [],
      session_crons: Array.from({ length: 40 }, (_, index) => ({
        id: `cron-${index}`,
      })),
    },
    context,
  );
  assert.deepEqual(cronOverflow?.activeWork?.at(-1), {
    id: "cron:overflow",
    kind: "session-cron",
  });
});

test("maps current Codex hooks and preserves turn IDs without replacing notify", () => {
  const started = adaptCodexHook(
    {
      hook_event_name: "UserPromptSubmit",
      session_id: "codex-session",
      turn_id: "codex-turn",
      prompt: "private",
    },
    context,
  );
  const waiting = adaptCodexHook(
    {
      hook_event_name: "PermissionRequest",
      session_id: "codex-session",
      turn_id: "codex-turn",
    },
    context,
  );
  const ended = adaptCodexHook(
    {
      hook_event_name: "SessionEnd",
      session_id: "codex-session",
      reason: "other",
    },
    context,
  );

  assert.equal(started?.kind, "turn.started");
  assert.equal(started?.turnId, "codex-turn");
  assert.equal(waiting?.kind, "attention.waiting");
  assert.equal(ended?.kind, "session.ended");
  assert.equal(ended?.reason, "other");
  assert.equal(JSON.stringify(started).includes("private"), false);
});

test("retains wrapper ownership when a provider supplies its own session ID", () => {
  const adapted = adaptClaudeHook(
    {
      hook_event_name: "UserPromptSubmit",
      session_id: "native-claude-session",
    },
    {
      ...context,
      fallbackSessionId: "wrapper-session",
      wrapperSessionId: "wrapper-session",
    },
  );

  assert.equal(adapted?.sessionId, "native-claude-session");
  assert.equal(adapted?.wrapperSessionId, "wrapper-session");
});

test("maps synchronous Gemini agent and permission hooks", () => {
  assert.equal(
    adaptGeminiHook(
      { hook_event_name: "BeforeAgent", session_id: "gemini-session" },
      context,
    )?.kind,
    "turn.started",
  );
  const completed = adaptGeminiHook(
    { hook_event_name: "AfterAgent", session_id: "gemini-session" },
    context,
  );
  assert.equal(completed?.kind, "turn.completed");
  assert.equal(completed?.confidence, "heuristic");
  assert.equal(
    adaptGeminiHook(
      {
        hook_event_name: "Notification",
        notification_type: "ToolPermission",
        session_id: "gemini-session",
      },
      context,
    )?.kind,
    "attention.waiting",
  );
});

test("marks provider completion hooks as pre-final", () => {
  assert.equal(
    adaptClaudeHook(
      { hook_event_name: "Stop", session_id: "claude-session" },
      context,
    )?.confidence,
    "heuristic",
  );
  assert.equal(
    adaptCodexHook(
      { hook_event_name: "Stop", session_id: "codex-session" },
      context,
    )?.confidence,
    "heuristic",
  );
});

test("maps OpenCode session, error, and permission events", () => {
  const event = (type: string, properties: Record<string, unknown> = {}) =>
    adaptOpenCodeEvent(
      { type, properties: { sessionID: "opencode-session", ...properties } },
      context,
    );

  assert.equal(event("session.created")?.kind, "session.started");
  assert.equal(event("session.status", { status: { type: "busy" } })?.kind, "turn.started");
  assert.equal(event("session.idle")?.kind, "turn.completed");
  assert.equal(event("session.error")?.kind, "turn.failed");
  assert.equal(event("permission.asked")?.kind, "attention.waiting");
  assert.equal(event("permission.replied")?.kind, "attention.acknowledged");
  assert.equal(event("session.deleted")?.kind, "session.ended");
  assert.equal(
    event("session.idle", {
      info: { id: "child-session", parentID: "opencode-session" },
    }),
    undefined,
  );
});

test("ignores unsupported events and rejects missing provider session IDs", () => {
  assert.equal(
    adaptClaudeHook(
      { hook_event_name: "PostToolUse", session_id: "claude-session" },
      context,
    ),
    undefined,
  );
  assert.throws(
    () => adaptCodexHook({ hook_event_name: "Stop" }, context),
    /session/i,
  );
});
