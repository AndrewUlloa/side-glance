import assert from "node:assert/strict";
import test from "node:test";

import { createSignalState, reduceSignalEvent } from "../../src/core/reducer.ts";
import type { SignalEvent } from "../../src/core/protocol.ts";

const baseEvent = {
  v: 1,
  source: "claude",
  sessionId: "session-a",
  occurredAt: 1_000,
  confidence: "native",
  target: { surfaceId: "tty:/dev/ttys001", tty: "/dev/ttys001" },
} satisfies Omit<SignalEvent, "eventId" | "kind">;

function event(
  eventId: string,
  kind: SignalEvent["kind"],
  overrides: Partial<SignalEvent> = {},
): SignalEvent {
  return { ...baseEvent, eventId, kind, ...overrides };
}

test("moves a native session through working, waiting, and completed", () => {
  let state = createSignalState();
  state = reduceSignalEvent(state, event("e1", "session.started"));
  state = reduceSignalEvent(
    state,
    event("e2", "turn.started", { generation: 1, turnId: "turn-1" }),
  );
  state = reduceSignalEvent(
    state,
    event("e3", "attention.waiting", { generation: 1, turnId: "turn-1" }),
  );

  assert.equal(state.sessions["claude:session-a"]?.phase, "waiting");

  state = reduceSignalEvent(
    state,
    event("e4", "turn.completed", { generation: 1, turnId: "turn-1" }),
  );

  assert.deepEqual(state.sessions["claude:session-a"], {
    source: "claude",
    sessionId: "session-a",
    phase: "completed",
    generation: 1,
    turnId: "turn-1",
    confidence: "native",
    target: baseEvent.target,
    startedAt: 1_000,
    updatedAt: 1_000,
  });
});

test("ignores an older generation after a newer turn starts", () => {
  let state = createSignalState();
  state = reduceSignalEvent(
    state,
    event("e1", "turn.started", { generation: 1, turnId: "turn-1" }),
  );
  state = reduceSignalEvent(
    state,
    event("e2", "turn.started", {
      generation: 2,
      turnId: "turn-2",
      occurredAt: 2_000,
    }),
  );
  const beforeStaleEvent = state;

  state = reduceSignalEvent(
    state,
    event("e3", "turn.completed", { generation: 1, turnId: "turn-1" }),
  );

  assert.strictEqual(state, beforeStaleEvent);
  assert.equal(state.sessions["claude:session-a"]?.phase, "working");
  assert.equal(state.sessions["claude:session-a"]?.turnId, "turn-2");
});

test("applies a duplicate event ID only once", () => {
  const first = event("same-event", "turn.started", {
    generation: 1,
    turnId: "turn-1",
  });
  const once = reduceSignalEvent(createSignalState(), first);
  const twice = reduceSignalEvent(once, first);

  assert.strictEqual(twice, once);
  assert.deepEqual(twice.seenEventIds, ["same-event"]);
});
