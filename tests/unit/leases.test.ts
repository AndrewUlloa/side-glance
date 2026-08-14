import assert from "node:assert/strict";
import test from "node:test";

import { resolveSurface } from "../../src/core/leases.ts";
import { createSideGlanceState, reduceSideGlanceEvent } from "../../src/core/reducer.ts";
import type { SideGlanceEvent, SideGlanceSource } from "../../src/core/protocol.ts";

const surfaceId = "tty:/dev/ttys001";

function sideGlanceEvent(
  source: SideGlanceSource,
  sessionId: string,
  eventId: string,
  kind: SideGlanceEvent["kind"],
  occurredAt: number,
): SideGlanceEvent {
  return {
    v: 1,
    source,
    sessionId,
    eventId,
    kind,
    occurredAt,
    confidence: "native",
    target: { surfaceId, tty: "/dev/ttys001" },
  };
}

test("releasing one session reveals the remaining owner instead of clearing the surface", () => {
  let state = createSideGlanceState();
  state = reduceSideGlanceEvent(
    state,
    sideGlanceEvent("claude", "session-a", "a-start", "turn.started", 1_000),
  );
  state = reduceSideGlanceEvent(
    state,
    sideGlanceEvent("claude", "session-a", "a-done", "turn.completed", 1_100),
  );
  state = reduceSideGlanceEvent(
    state,
    sideGlanceEvent("codex", "session-b", "b-start", "turn.started", 1_200),
  );
  state = reduceSideGlanceEvent(
    state,
    sideGlanceEvent("codex", "session-b", "b-wait", "attention.waiting", 1_300),
  );

  assert.equal(resolveSurface(state, surfaceId)?.ownerKey, "codex:session-b");
  assert.equal(resolveSurface(state, surfaceId)?.session.phase, "waiting");

  state = reduceSideGlanceEvent(
    state,
    sideGlanceEvent("codex", "session-b", "b-end", "session.ended", 1_400),
  );

  assert.equal(resolveSurface(state, surfaceId)?.ownerKey, "claude:session-a");
  assert.equal(resolveSurface(state, surfaceId)?.session.phase, "completed");

  state = reduceSideGlanceEvent(
    state,
    sideGlanceEvent("claude", "session-a", "a-end", "session.ended", 1_500),
  );

  assert.equal(resolveSurface(state, surfaceId), undefined);
});

test("uses attention priority before recency", () => {
  let state = createSideGlanceState();
  state = reduceSideGlanceEvent(
    state,
    sideGlanceEvent("claude", "failed", "failed-start", "turn.started", 1_000),
  );
  state = reduceSideGlanceEvent(
    state,
    sideGlanceEvent("claude", "failed", "failed-end", "turn.failed", 1_100),
  );
  state = reduceSideGlanceEvent(
    state,
    sideGlanceEvent("codex", "working", "working-start", "turn.started", 2_000),
  );

  assert.equal(resolveSurface(state, surfaceId)?.ownerKey, "claude:failed");
  assert.equal(resolveSurface(state, surfaceId)?.session.phase, "failed");
});

test("breaks equal-priority ties by recency and then stable owner key", () => {
  let state = createSideGlanceState();
  state = reduceSideGlanceEvent(
    state,
    sideGlanceEvent("codex", "zeta", "zeta", "turn.completed", 1_000),
  );
  state = reduceSideGlanceEvent(
    state,
    sideGlanceEvent("claude", "alpha", "alpha", "turn.completed", 1_000),
  );

  assert.equal(resolveSurface(state, surfaceId)?.ownerKey, "claude:alpha");

  state = reduceSideGlanceEvent(
    state,
    sideGlanceEvent("codex", "newer", "newer", "turn.completed", 2_000),
  );

  assert.equal(resolveSurface(state, surfaceId)?.ownerKey, "codex:newer");
});
