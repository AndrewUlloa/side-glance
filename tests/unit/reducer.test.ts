import assert from "node:assert/strict";
import test from "node:test";

import { createSideGlanceState, reduceSideGlanceEvent } from "../../src/core/reducer.ts";
import type { SideGlanceEvent } from "../../src/core/protocol.ts";

const baseEvent = {
  v: 1,
  source: "claude",
  sessionId: "session-a",
  occurredAt: 1_000,
  confidence: "native",
  target: { surfaceId: "tty:/dev/ttys001", tty: "/dev/ttys001" },
} satisfies Omit<SideGlanceEvent, "eventId" | "kind">;

function event(
  eventId: string,
  kind: SideGlanceEvent["kind"],
  overrides: Partial<SideGlanceEvent> = {},
): SideGlanceEvent {
  return { ...baseEvent, eventId, kind, ...overrides };
}

test("moves a native session through working, waiting, and completed", () => {
  let state = createSideGlanceState();
  state = reduceSideGlanceEvent(state, event("e1", "session.started"));
  state = reduceSideGlanceEvent(
    state,
    event("e2", "turn.started", {
      occurredAt: 2_000,
      generation: 1,
      turnId: "turn-1",
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("e3", "attention.waiting", {
      occurredAt: 3_000,
      generation: 1,
      turnId: "turn-1",
    }),
  );

  assert.equal(state.sessions["claude:session-a"]?.phase, "waiting");

  state = reduceSideGlanceEvent(
    state,
    event("e4", "turn.completed", {
      occurredAt: 4_000,
      generation: 1,
      turnId: "turn-1",
    }),
  );

  assert.deepEqual(state.sessions["claude:session-a"], {
    source: "claude",
    sessionId: "session-a",
    phase: "completed",
    generation: 1,
    turnId: "turn-1",
    confidence: "native",
    target: baseEvent.target,
    startedAt: 2_000,
    completedAt: 4_000,
    completionCeilingSeconds: 300,
    completionSnapshotKey: "turn:turn-1",
    durationSampleKey: "turn:turn-1",
    leaseExpiresAt: 1_804_000,
    updatedAt: 4_000,
  });
});

test("keeps a parent working until a later Stop confirms no aggregate work", () => {
  let state = createSideGlanceState();
  state = reduceSideGlanceEvent(
    state,
    event("turn-start", "turn.started", {
      occurredAt: 1_000,
      generation: 1,
      turnId: "turn-1",
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("child-start", "work.started", {
      occurredAt: 2_000,
      generation: 1,
      turnId: "turn-1",
      work: { id: "subagent:a", kind: "subagent" },
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("parent-stop-busy", "turn.completed", {
      occurredAt: 3_000,
      generation: 1,
      turnId: "turn-1",
      activeWork: [{ id: "subagent:a", kind: "subagent" }],
    }),
  );

  assert.equal(state.sessions["claude:session-a"]?.phase, "working");
  assert.equal(state.sessions["claude:session-a"]?.completedAt, undefined);

  state = reduceSideGlanceEvent(
    state,
    event("child-finish", "work.finished", {
      occurredAt: 4_000,
      generation: 1,
      turnId: "turn-1",
      work: { id: "subagent:a", kind: "subagent" },
    }),
  );
  assert.equal(state.sessions["claude:session-a"]?.phase, "working");
  assert.deepEqual(state.sessions["claude:session-a"]?.activeWork, []);

  state = reduceSideGlanceEvent(
    state,
    event("parent-stop-empty", "turn.completed", {
      occurredAt: 5_000,
      generation: 1,
      turnId: "turn-1",
      activeWork: [],
    }),
  );
  assert.equal(state.sessions["claude:session-a"]?.phase, "completed");
  assert.equal(state.sessions["claude:session-a"]?.completedAt, 5_000);
});

test("preserves known work when a completion snapshot is missing", () => {
  let state = reduceSideGlanceEvent(
    createSideGlanceState(),
    event("child-start", "work.started", {
      work: { id: "subagent:a", kind: "subagent" },
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("parent-stop", "turn.completed", { occurredAt: 2_000 }),
  );

  assert.equal(state.sessions["claude:session-a"]?.phase, "working");
  assert.deepEqual(state.sessions["claude:session-a"]?.activeWork, [
    { id: "subagent:a", kind: "subagent" },
  ]);
});

test("does not let an empty registry snapshot erase a tracked subagent", () => {
  let state = reduceSideGlanceEvent(
    createSideGlanceState(),
    event("child-start", "work.started", {
      occurredAt: 1_000,
      work: { id: "subagent:a", kind: "subagent" },
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("parent-stop", "turn.completed", {
      occurredAt: 2_000,
      activeWork: [],
    }),
  );

  assert.equal(state.sessions["claude:session-a"]?.phase, "working");
  assert.deepEqual(state.sessions["claude:session-a"]?.activeWork, [
    { id: "subagent:a", kind: "subagent" },
  ]);
});

test("bounds concurrent tracked work with a conservative overflow sentinel", () => {
  let state = createSideGlanceState();
  for (let index = 0; index < 33; index += 1) {
    state = reduceSideGlanceEvent(
      state,
      event(`child-start-${index}`, "work.started", {
        occurredAt: 1_000 + index,
        work: { id: `subagent:${index}`, kind: "subagent" },
      }),
    );
  }

  const activeWork = state.sessions["claude:session-a"]?.activeWork ?? [];
  assert.equal(activeWork.length, 32);
  assert.deepEqual(activeWork.at(-1), {
    id: "subagent:overflow",
    kind: "subagent",
  });

  state = reduceSideGlanceEvent(
    state,
    event("mixed-parent-stop", "turn.completed", {
      occurredAt: 2_000,
      activeWork: Array.from({ length: 32 }, (_, index) => ({
        id: `background:${index}`,
        kind: "background-task" as const,
      })),
    }),
  );
  assert.equal(
    state.sessions["claude:session-a"]?.activeWork?.length,
    32,
  );
  assert.equal(state.sessions["claude:session-a"]?.phase, "working");
});

test("accepts a matching child finish at the same millisecond", () => {
  let state = reduceSideGlanceEvent(
    createSideGlanceState(),
    event("same-time-start", "work.started", {
      occurredAt: 2_000,
      work: { id: "subagent:a", kind: "subagent" },
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("same-time-finish", "work.finished", {
      occurredAt: 2_000,
      work: { id: "subagent:a", kind: "subagent" },
    }),
  );
  assert.deepEqual(state.sessions["claude:session-a"]?.activeWork, []);
  assert.equal(state.sessions["claude:session-a"]?.phase, "working");

  state = reduceSideGlanceEvent(
    state,
    event("later-parent-stop", "turn.completed", {
      occurredAt: 2_001,
      activeWork: [],
    }),
  );
  assert.equal(state.sessions["claude:session-a"]?.phase, "completed");
});

test("lets same-time activity win over an empty completion in either order", () => {
  const start = event("child-start", "work.started", {
    occurredAt: 2_000,
    work: { id: "subagent:a", kind: "subagent" },
  });
  const done = event("parent-stop", "turn.completed", {
    occurredAt: 2_000,
    activeWork: [],
  });

  const startThenDone = reduceSideGlanceEvent(
    reduceSideGlanceEvent(createSideGlanceState(), start),
    done,
  );
  const doneThenStart = reduceSideGlanceEvent(
    reduceSideGlanceEvent(createSideGlanceState(), done),
    start,
  );

  assert.equal(startThenDone.sessions["claude:session-a"]?.phase, "working");
  assert.equal(doneThenStart.sessions["claude:session-a"]?.phase, "working");
});

test("requires a completion to be later than matching work-finish evidence", () => {
  const start = event("child-start-finish-order", "work.started", {
    occurredAt: 2_000,
    work: { id: "subagent:a", kind: "subagent" },
  });
  const finish = event("child-finish-order", "work.finished", {
    occurredAt: 3_000,
    work: { id: "subagent:a", kind: "subagent" },
  });
  const done = event("parent-stop-finish-order", "turn.completed", {
    occurredAt: 3_000,
    activeWork: [],
  });

  const finishThenDone = reduceSideGlanceEvent(
    reduceSideGlanceEvent(reduceSideGlanceEvent(createSideGlanceState(), start), finish),
    done,
  );
  const doneThenFinish = reduceSideGlanceEvent(
    reduceSideGlanceEvent(reduceSideGlanceEvent(createSideGlanceState(), start), done),
    finish,
  );

  assert.equal(finishThenDone.sessions["claude:session-a"]?.phase, "working");
  assert.equal(doneThenFinish.sessions["claude:session-a"]?.phase, "working");
  assert.equal(finishThenDone.sessions["claude:session-a"]?.completedAt, undefined);
});

test("lets a same-time turn start outrank completion in either order", () => {
  const start = event("same-turn-start", "turn.started", { occurredAt: 3_000 });
  const done = event("same-turn-done", "turn.completed", {
    occurredAt: 3_000,
    activeWork: [],
  });

  const startThenDone = reduceSideGlanceEvent(
    reduceSideGlanceEvent(createSideGlanceState(), start),
    done,
  );
  const doneThenStart = reduceSideGlanceEvent(
    reduceSideGlanceEvent(createSideGlanceState(), done),
    start,
  );

  assert.equal(startThenDone.sessions["claude:session-a"]?.phase, "working");
  assert.equal(doneThenStart.sessions["claude:session-a"]?.phase, "working");
});

test("lets same-time attention and failure outrank completion in either order", () => {
  for (const [kind, expected] of [
    ["attention.waiting", "waiting"],
    ["turn.failed", "failed"],
  ] as const) {
    const attention = event(`${kind}-same-time`, kind, { occurredAt: 3_000 });
    const done = event(`${kind}-completion`, "turn.completed", {
      occurredAt: 3_000,
      activeWork: [],
    });
    const attentionThenDone = reduceSideGlanceEvent(
      reduceSideGlanceEvent(createSideGlanceState(), attention),
      done,
    );
    const doneThenAttention = reduceSideGlanceEvent(
      reduceSideGlanceEvent(createSideGlanceState(), done),
      attention,
    );

    assert.equal(attentionThenDone.sessions["claude:session-a"]?.phase, expected);
    assert.equal(doneThenAttention.sessions["claude:session-a"]?.phase, expected);
  }
});

test("preserves known aggregate work across same-session resume and compact starts", () => {
  let state = reduceSideGlanceEvent(
    createSideGlanceState(),
    event("resume-child", "work.started", {
      occurredAt: 1_000,
      work: { id: "subagent:a", kind: "subagent" },
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("session-resume", "session.started", {
      occurredAt: 2_000,
      reason: "resume",
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("resume-stop-unknown", "turn.completed", { occurredAt: 3_000 }),
  );

  assert.equal(state.sessions["claude:session-a"]?.phase, "working");
  assert.deepEqual(state.sessions["claude:session-a"]?.activeWork, [
    { id: "subagent:a", kind: "subagent" },
  ]);
});

test("reconciles a work-finish event with its authoritative registry snapshot", () => {
  let state = reduceSideGlanceEvent(
    createSideGlanceState(),
    event("registry-child", "work.started", {
      occurredAt: 1_000,
      work: { id: "subagent:a", kind: "subagent" },
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("registry-child-stop", "work.finished", {
      occurredAt: 2_000,
      work: { id: "subagent:a", kind: "subagent" },
      activeWork: [{ id: "background:b", kind: "background-task" }],
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("registry-parent-stop", "turn.completed", { occurredAt: 3_000 }),
  );

  assert.equal(state.sessions["claude:session-a"]?.phase, "working");
  assert.deepEqual(state.sessions["claude:session-a"]?.activeWork, [
    { id: "background:b", kind: "background-task" },
  ]);
});

test("clears bounded background overflow after authoritative registry empties", () => {
  let state = reduceSideGlanceEvent(
    createSideGlanceState(),
    event("overflow-child", "work.started", {
      occurredAt: 1_000,
      work: { id: "subagent:a", kind: "subagent" },
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("overflow-busy-stop", "turn.completed", {
      occurredAt: 2_000,
      activeWork: Array.from({ length: 32 }, (_, index) => ({
        id: `background:${index}`,
        kind: "background-task" as const,
      })),
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("overflow-child-stop", "work.finished", {
      occurredAt: 3_000,
      work: { id: "subagent:a", kind: "subagent" },
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("overflow-empty-stop", "turn.completed", {
      occurredAt: 4_000,
      activeWork: [],
    }),
  );

  assert.equal(state.sessions["claude:session-a"]?.phase, "completed");
  assert.deepEqual(state.sessions["claude:session-a"]?.activeWork, []);
});

test("learns reply latency with a per-session EWMA after completed turns", () => {
  const epoch = 1_786_536_000_000;
  let state = createSideGlanceState();

  for (let turn = 0; turn < 3; turn += 1) {
    const startedAt = epoch + turn * 75_000;
    state = reduceSideGlanceEvent(
      state,
      event(`start-${turn}`, "turn.started", {
        occurredAt: startedAt,
        generation: turn + 1,
        turnId: `turn-${turn}`,
      }),
    );
    state = reduceSideGlanceEvent(
      state,
      event(`done-${turn}`, "turn.completed", {
        occurredAt: startedAt + 60_000,
        generation: turn + 1,
        turnId: `turn-${turn}`,
      }),
    );
  }

  state = reduceSideGlanceEvent(
    state,
    event("start-3", "turn.started", {
      occurredAt: epoch + 225_000,
      generation: 4,
      turnId: "turn-3",
    }),
  );

  const session = state.sessions["claude:session-a"];
  assert.equal(session?.responseEwmaSeconds, 37.68);
  assert.equal(session?.completedAt, undefined);
  assert.equal(session?.startedAt, epoch + 225_000);
});

test("learns a source-local completion ceiling after rendering against the prior ceiling", () => {
  let state = createSideGlanceState();

  for (let turn = 0; turn < 8; turn += 1) {
    const startedAt = turn * 500_000 + 1_000;
    state = reduceSideGlanceEvent(
      state,
      event(`learn-start-${turn}`, "turn.started", {
        occurredAt: startedAt,
        generation: turn + 1,
        turnId: `learn-turn-${turn}`,
      }),
    );
    state = reduceSideGlanceEvent(
      state,
      event(`learn-done-${turn}`, "turn.completed", {
        occurredAt: startedAt + 400_000,
        generation: turn + 1,
        turnId: `learn-turn-${turn}`,
        activeWork: [],
      }),
    );
  }

  assert.equal(state.schemaVersion, 2);
  assert.equal(state.durationProfiles.claude?.ceilingSeconds, 360);
  assert.equal(state.durationProfiles.claude?.samplesSeconds.length, 8);
  assert.equal(
    state.sessions["claude:session-a"]?.completionCeilingSeconds,
    300,
  );
  assert.equal(state.durationProfiles.codex, undefined);
});

test("a duplicate semantic completion preserves the turn's prior ceiling", () => {
  let state = createSideGlanceState();
  for (let turn = 0; turn < 8; turn += 1) {
    const startedAt = turn * 500_000 + 1_000;
    state = reduceSideGlanceEvent(
      state,
      event(`duplicate-start-${turn}`, "turn.started", {
        occurredAt: startedAt,
        generation: turn + 1,
        turnId: `duplicate-turn-${turn}`,
      }),
    );
    state = reduceSideGlanceEvent(
      state,
      event(`duplicate-done-${turn}`, "turn.completed", {
        occurredAt: startedAt + 400_000,
        generation: turn + 1,
        turnId: `duplicate-turn-${turn}`,
      }),
    );
  }

  assert.equal(state.durationProfiles.claude?.ceilingSeconds, 360);
  assert.equal(state.sessions["claude:session-a"]?.completionCeilingSeconds, 300);
  state = reduceSideGlanceEvent(
    state,
    event("duplicate-done-transport", "turn.completed", {
      occurredAt: 3_901_000,
      generation: 8,
      turnId: "duplicate-turn-7",
    }),
  );

  assert.equal(state.sessions["claude:session-a"]?.completionCeilingSeconds, 300);
  assert.equal(state.durationProfiles.claude?.samplesSeconds.length, 8);
});

test("an ineligible completion keeps its ceiling after another session trains", () => {
  let state = reduceSideGlanceEvent(
    createSideGlanceState(),
    event("quick-start", "turn.started", {
      sessionId: "quick",
      occurredAt: 1_000,
      generation: 1,
      turnId: "quick-turn",
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("quick-done", "turn.completed", {
      sessionId: "quick",
      occurredAt: 1_500,
      generation: 1,
      turnId: "quick-turn",
    }),
  );
  for (let turn = 0; turn < 8; turn += 1) {
    const startedAt = 10_000 + turn * 500_000;
    state = reduceSideGlanceEvent(
      state,
      event(`other-start-${turn}`, "turn.started", {
        sessionId: "other",
        occurredAt: startedAt,
        generation: turn + 1,
        turnId: `other-turn-${turn}`,
      }),
    );
    state = reduceSideGlanceEvent(
      state,
      event(`other-done-${turn}`, "turn.completed", {
        sessionId: "other",
        occurredAt: startedAt + 400_000,
        generation: turn + 1,
        turnId: `other-turn-${turn}`,
      }),
    );
  }
  assert.equal(state.durationProfiles.claude?.ceilingSeconds, 360);

  state = reduceSideGlanceEvent(
    state,
    event("quick-done-duplicate", "turn.completed", {
      sessionId: "quick",
      occurredAt: 1_500,
      generation: 1,
      turnId: "quick-turn",
    }),
  );

  assert.equal(state.sessions["claude:quick"]?.completionCeilingSeconds, 300);
  assert.equal(state.durationProfiles.claude?.samplesSeconds.length, 8);
});

test("session end rejects delayed lifecycle follow-ups until an explicit restart", () => {
  let state = reduceSideGlanceEvent(
    createSideGlanceState(),
    event("ended-start", "turn.started", { generation: 1, turnId: "ended-turn" }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("ended-work", "work.started", {
      occurredAt: 2_000,
      generation: 1,
      turnId: "ended-turn",
      work: { id: "subagent:ended", kind: "subagent" },
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("ended-session", "session.ended", { occurredAt: 3_000 }),
  );
  const ended = state;

  state = reduceSideGlanceEvent(
    state,
    event("ended-late-work", "work.finished", {
      occurredAt: 4_000,
      generation: 1,
      turnId: "ended-turn",
      work: { id: "subagent:ended", kind: "subagent" },
    }),
  );
  assert.strictEqual(state, ended);

  state = reduceSideGlanceEvent(
    state,
    event("ended-restart", "session.started", { occurredAt: 5_000, generation: 2 }),
  );
  assert.equal(state.sessions["claude:session-a"]?.phase, "working");
});

test("manual reset rejects delayed follow-ups but accepts a new prompt", () => {
  let state = reduceSideGlanceEvent(
    createSideGlanceState(),
    event("manual-start", "turn.started", {
      generation: 1,
      turnId: "manual-turn",
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("manual-child", "work.started", {
      occurredAt: 2_000,
      generation: 1,
      turnId: "manual-turn",
      work: { id: "subagent:manual", kind: "subagent" },
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("manual-reset", "session.ended", {
      occurredAt: 3_000,
      reason: "manual-reset",
    }),
  );
  const reset = state;

  state = reduceSideGlanceEvent(
    state,
    event("manual-delayed-work", "work.finished", {
      occurredAt: 4_000,
      generation: 1,
      turnId: "manual-turn",
      work: { id: "subagent:manual", kind: "subagent" },
    }),
  );
  assert.strictEqual(state, reset);

  state = reduceSideGlanceEvent(
    state,
    event("manual-new-prompt", "turn.started", {
      occurredAt: 5_000,
      generation: 2,
      turnId: "next-turn",
    }),
  );
  assert.equal(state.sessions["claude:session-a"]?.phase, "working");
});

test("learns independent sliding ceilings for two provider sources", () => {
  let state = createSideGlanceState();
  for (const [source, duration] of [
    ["claude", 400_000],
    ["codex", 60_000],
  ] as const) {
    for (let turn = 0; turn < 8; turn += 1) {
      const startedAt = turn * 500_000 + 1_000;
      state = reduceSideGlanceEvent(
        state,
        event(`${source}-start-${turn}`, "turn.started", {
          source,
          sessionId: `${source}-learning`,
          occurredAt: startedAt,
          generation: turn + 1,
          turnId: `${source}-turn-${turn}`,
        }),
      );
      state = reduceSideGlanceEvent(
        state,
        event(`${source}-done-${turn}`, "turn.completed", {
          source,
          sessionId: `${source}-learning`,
          occurredAt: startedAt + duration,
          generation: turn + 1,
          turnId: `${source}-turn-${turn}`,
        }),
      );
    }
  }

  assert.equal(state.durationProfiles.claude?.ceilingSeconds, 360);
  assert.equal(state.durationProfiles.codex?.ceilingSeconds, 270);
});

test("does not train duration history from notification-only completion", () => {
  let state = reduceSideGlanceEvent(
    createSideGlanceState(),
    event("notify-start", "turn.started", { occurredAt: 1_000 }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("notify-done", "turn.completed", {
      occurredAt: 61_000,
      confidence: "notification",
    }),
  );

  assert.equal(state.durationProfiles.claude, undefined);
});

test("does not train when a completion inherits notification confidence", () => {
  let state = reduceSideGlanceEvent(
    createSideGlanceState(),
    event("notify-start", "turn.started", {
      occurredAt: 1_000,
      confidence: "notification",
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("notify-done", "turn.completed", {
      occurredAt: 61_000,
      confidence: undefined,
    }),
  );

  assert.equal(state.sessions["claude:session-a"]?.confidence, "notification");
  assert.equal(state.durationProfiles.claude, undefined);
});

test("trains duration history only once per semantic turn", () => {
  let state = reduceSideGlanceEvent(
    createSideGlanceState(),
    event("sample-start", "turn.started", {
      occurredAt: 1_000,
      generation: 1,
      turnId: "sample-turn",
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("sample-done-one", "turn.completed", {
      occurredAt: 61_000,
      generation: 1,
      turnId: "sample-turn",
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("sample-correction-work", "work.started", {
      occurredAt: 62_000,
      generation: 1,
      turnId: "sample-turn",
      work: { id: "subagent:correction", kind: "subagent" },
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("sample-correction-finish", "work.finished", {
      occurredAt: 63_000,
      generation: 1,
      turnId: "sample-turn",
      work: { id: "subagent:correction", kind: "subagent" },
    }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("sample-done-two", "turn.completed", {
      occurredAt: 64_000,
      generation: 1,
      turnId: "sample-turn",
    }),
  );

  assert.deepEqual(state.durationProfiles.claude?.samplesSeconds, [60]);
});

test("ignores an older generation after a newer turn starts", () => {
  let state = createSideGlanceState();
  state = reduceSideGlanceEvent(
    state,
    event("e1", "turn.started", { generation: 1, turnId: "turn-1" }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("e2", "turn.started", {
      generation: 2,
      turnId: "turn-2",
      occurredAt: 2_000,
    }),
  );
  const beforeStaleEvent = state;

  state = reduceSideGlanceEvent(
    state,
    event("e3", "turn.completed", { generation: 1, turnId: "turn-1" }),
  );

  assert.strictEqual(state, beforeStaleEvent);
  assert.equal(state.sessions["claude:session-a"]?.phase, "working");
  assert.equal(state.sessions["claude:session-a"]?.turnId, "turn-2");
});

test("ignores a delayed provider event whose turn ID no longer owns the session", () => {
  let state = createSideGlanceState();
  state = reduceSideGlanceEvent(
    state,
    event("turn-1-start", "turn.started", { turnId: "turn-1" }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("turn-2-start", "turn.started", {
      turnId: "turn-2",
      occurredAt: 2_000,
    }),
  );
  const beforeDelayedCompletion = state;

  state = reduceSideGlanceEvent(
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
  const once = reduceSideGlanceEvent(createSideGlanceState(), first);
  const twice = reduceSideGlanceEvent(once, first);

  assert.strictEqual(twice, once);
  assert.deepEqual(twice.seenEventIds, ["same-event"]);
});

test("rejects a delayed event even when the provider cannot supply a turn ID", () => {
  let state = reduceSideGlanceEvent(
    createSideGlanceState(),
    event("start", "turn.started", { occurredAt: 2_000 }),
  );
  state = reduceSideGlanceEvent(
    state,
    event("done", "turn.completed", { occurredAt: 3_000 }),
  );
  const completed = state;

  state = reduceSideGlanceEvent(
    state,
    event("late-wait", "attention.waiting", { occurredAt: 2_500 }),
  );

  assert.strictEqual(state, completed);
  assert.equal(state.sessions["claude:session-a"]?.phase, "completed");
});

test("bounds the replay cache without changing the newest event order", () => {
  let state = createSideGlanceState();
  for (let index = 0; index < 4_100; index += 1) {
    state = reduceSideGlanceEvent(
      state,
      event(`event-${index}`, "attention.waiting", { occurredAt: index + 1 }),
    );
  }

  assert.equal(state.seenEventIds.length, 4_096);
  assert.equal(state.seenEventIds[0], "event-4");
  assert.equal(state.seenEventIds.at(-1), "event-4099");
});

test("bounds inactive session history while preserving every active session", () => {
  let state = createSideGlanceState();
  for (let index = 0; index < 520; index += 1) {
    const sessionId = `inactive-${index}`;
    state = reduceSideGlanceEvent(
      state,
      event(`start-${index}`, "turn.started", {
        sessionId,
        occurredAt: index * 2 + 1,
      }),
    );
    state = reduceSideGlanceEvent(
      state,
      event(`end-${index}`, "session.ended", {
        sessionId,
        occurredAt: index * 2 + 2,
      }),
    );
  }
  for (let index = 0; index < 3; index += 1) {
    state = reduceSideGlanceEvent(
      state,
      event(`active-${index}`, "turn.started", {
        sessionId: `active-${index}`,
        occurredAt: 2_000 + index,
      }),
    );
  }

  const sessions = Object.values(state.sessions);
  assert.equal(sessions.filter(({ phase }) => phase === "inactive").length, 512);
  assert.equal(sessions.filter(({ phase }) => phase !== "inactive").length, 3);
  assert.equal(state.sessions["claude:inactive-0"], undefined);
  assert.equal(state.sessions["claude:inactive-519"]?.phase, "inactive");
});
