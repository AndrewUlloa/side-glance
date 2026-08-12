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

test("ignores a delayed provider event whose turn ID no longer owns the session", () => {
  let state = createSignalState();
  state = reduceSignalEvent(
    state,
    event("turn-1-start", "turn.started", { turnId: "turn-1" }),
  );
  state = reduceSignalEvent(
    state,
    event("turn-2-start", "turn.started", {
      turnId: "turn-2",
      occurredAt: 2_000,
    }),
  );
  const beforeDelayedCompletion = state;

  state = reduceSignalEvent(
    state,
    event("turn-1-late", "turn.completed", {
      turnId: "turn-1",
      occurredAt: 3_000,
    }),
  );

  assert.strictEqual(state, beforeDelayedCompletion);
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

test("rejects a delayed event even when the provider cannot supply a turn ID", () => {
  let state = reduceSignalEvent(
    createSignalState(),
    event("start", "turn.started", { occurredAt: 2_000 }),
  );
  state = reduceSignalEvent(
    state,
    event("done", "turn.completed", { occurredAt: 3_000 }),
  );
  const completed = state;

  state = reduceSignalEvent(
    state,
    event("late-wait", "attention.waiting", { occurredAt: 2_500 }),
  );

  assert.strictEqual(state, completed);
  assert.equal(state.sessions["claude:session-a"]?.phase, "completed");
});

test("bounds the replay cache without changing the newest event order", () => {
  let state = createSignalState();
  for (let index = 0; index < 4_100; index += 1) {
    state = reduceSignalEvent(
      state,
      event(`event-${index}`, "attention.waiting", { occurredAt: index + 1 }),
    );
  }

  assert.equal(state.seenEventIds.length, 4_096);
  assert.equal(state.seenEventIds[0], "event-4");
  assert.equal(state.seenEventIds.at(-1), "event-4099");
});
