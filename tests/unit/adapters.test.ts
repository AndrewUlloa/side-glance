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
