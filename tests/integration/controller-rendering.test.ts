import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  SideGlanceController,
  type SurfaceRenderer,
  type SurfaceRenderResult,
} from "../../src/core/controller.ts";
import type {
  SideGlanceEvent,
  SideGlanceSessionState,
  SideGlanceTarget,
} from "../../src/core/protocol.ts";
import { FileSideGlanceStore } from "../../src/core/store.ts";
import type { EventNotifier } from "../../src/notifications/policy.ts";

interface PaintRecord {
  target: SideGlanceTarget;
  session: SideGlanceSessionState;
  wash: string;
  accent: string;
  urgency: number;
}

class RecordingRenderer implements SurfaceRenderer {
  readonly paints: PaintRecord[] = [];
  readonly resets: SideGlanceTarget[] = [];

  async paint(
    target: SideGlanceTarget,
    session: SideGlanceSessionState,
    visual: { wash: string; accent: string; urgency: number },
  ): Promise<SurfaceRenderResult> {
    this.paints.push({ target, session, ...visual });
    return {
      terminalPainted: Boolean(target.tty),
      tmuxSnapshot: target.tmuxPane
        ? {
            windowId: "@7",
            options: [
              { name: "window-status-style", local: false },
              { name: "window-status-current-style", local: false },
              { name: "window-status-format", local: false },
              { name: "window-status-current-format", local: false },
            ],
          }
        : undefined,
    };
  }

  async reset(target: SideGlanceTarget) {
    this.resets.push(target);
  }
}

class RecordingNotifier implements EventNotifier {
  readonly events: SideGlanceEvent[] = [];

  async notify(event: SideGlanceEvent): Promise<void> {
    this.events.push(event);
  }
}

async function controllerFixture(
  context: test.TestContext,
  notifier?: EventNotifier,
) {
  const directory = await mkdtemp(path.join(tmpdir(), "side-glance-controller-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const renderer = new RecordingRenderer();
  const store = new FileSideGlanceStore({ directory });
  const controller = new SideGlanceController(
    store,
    renderer,
    notifier,
  );
  return { controller, renderer, store };
}

function event(
  source: "claude" | "codex",
  sessionId: string,
  eventId: string,
  kind: SideGlanceEvent["kind"],
  occurredAt: number,
  overrides: Partial<SideGlanceEvent> = {},
): SideGlanceEvent {
  return {
    v: 1,
    source,
    sessionId,
    eventId,
    kind,
    occurredAt,
    confidence: "native",
    target: {
      surfaceId: "tty:/dev/ttys001",
      tty: "/dev/ttys001",
      tmuxPane: "%3",
    },
    ...overrides,
  };
}

test("renders lifecycle states and derives completion heat from turn runtime", async (context) => {
  const { controller, renderer } = await controllerFixture(context);
  const turnStartedAt = 1_786_536_000_000;

  await controller.submit(
    event("claude", "one", "start", "turn.started", turnStartedAt, {
      generation: 1,
      turnId: "turn-1",
    }),
  );
  await controller.submit(
    event("claude", "one", "wait", "attention.waiting", turnStartedAt + 10_000, {
      generation: 1,
      turnId: "turn-1",
    }),
  );
  const state = await controller.submit(
    event("claude", "one", "done", "turn.completed", turnStartedAt + 60_000, {
      generation: 1,
      turnId: "turn-1",
    }),
  );

  assert.deepEqual(
    renderer.paints.map(({ session, wash, accent, urgency }) => ({
      phase: session.phase,
      wash,
      accent,
      urgency,
    })),
    [
      { phase: "working", wash: "16352f", accent: "009d89", urgency: 0 },
      { phase: "waiting", wash: "4d3510", accent: "f0a726", urgency: 0 },
      { phase: "completed", wash: "3a2f16", accent: "e0a726", urgency: 500 },
    ],
  );
  assert.equal(
    state.surfaces["tty:/dev/ttys001"]?.tmuxSnapshot?.windowId,
    "@7",
  );
});

test("never renders a stale event and recomputes shared ownership before reset", async (context) => {
  const { controller, renderer } = await controllerFixture(context);

  await controller.submit(
    event("claude", "one", "one-start", "turn.started", 1_000, {
      generation: 2,
      turnId: "claude-turn",
    }),
  );
  await controller.submit(
    event("claude", "one", "one-done", "turn.completed", 1_060, {
      generation: 2,
      turnId: "claude-turn",
    }),
  );
  await controller.submit(
    event("codex", "two", "two-start", "turn.started", 2_000, {
      generation: 1,
      turnId: "codex-turn",
    }),
  );
  await controller.submit(
    event("codex", "two", "two-wait", "attention.waiting", 2_010, {
      generation: 1,
      turnId: "codex-turn",
    }),
  );
  const beforeStale = renderer.paints.length;
  await controller.submit(
    event("codex", "two", "two-stale", "turn.completed", 2_020, {
      generation: 0,
      turnId: "old-turn",
    }),
  );
  assert.equal(renderer.paints.length, beforeStale);

  await controller.submit(
    event("codex", "two", "two-end", "session.ended", 2_030, {
      generation: 1,
    }),
  );
  assert.equal(renderer.paints.at(-1)?.session.sessionId, "one");
  assert.equal(renderer.resets.length, 0);

  const final = await controller.submit(
    event("claude", "one", "one-end", "session.ended", 2_040, {
      generation: 2,
    }),
  );
  assert.equal(renderer.resets.length, 1);
  assert.equal(final.surfaces["tty:/dev/ttys001"]?.phase, "inactive");
});

test("releases the previous surface before painting a migrated session", async (context) => {
  const { controller, renderer } = await controllerFixture(context);
  const surfaceA = { surfaceId: "logical:A" };
  const surfaceB = { surfaceId: "logical:B" };

  await controller.submit(
    event("claude", "moving", "start-a", "turn.started", 1_000, {
      generation: 1,
      turnId: "turn-a",
      target: surfaceA,
    }),
  );
  const state = await controller.submit(
    event("claude", "moving", "start-b", "turn.started", 2_000, {
      generation: 2,
      turnId: "turn-b",
      target: surfaceB,
    }),
  );

  assert.deepEqual(renderer.resets, [surfaceA]);
  assert.equal(state.surfaces["logical:A"]?.phase, "inactive");
  assert.equal(state.surfaces["logical:A"]?.ownerKey, undefined);
  assert.equal(state.surfaces["logical:B"]?.phase, "working");
  assert.equal(state.surfaces["logical:B"]?.ownerKey, "claude:moving");
});

test("keeps one physical tmux window owned across pane releases", async (context) => {
  const { controller, renderer } = await controllerFixture(context);
  const surfaceId = "tmux:/private/tmp/tmux-501/default,123,0,@7";
  const paneThree = { surfaceId, tmuxPane: "%3" };
  const paneFour = { surfaceId, tmuxPane: "%4" };

  await controller.submit(
    event("claude", "pane-three", "three-start", "turn.started", 1_000, {
      target: paneThree,
    }),
  );
  await controller.submit(
    event("codex", "pane-four", "four-wait", "attention.waiting", 2_000, {
      target: paneFour,
    }),
  );
  const afterFirstRelease = await controller.submit(
    event("claude", "pane-three", "three-end", "session.ended", 3_000, {
      target: paneThree,
    }),
  );

  assert.equal(renderer.resets.length, 0);
  assert.equal(afterFirstRelease.surfaces[surfaceId]?.ownerKey, "codex:pane-four");
  assert.equal(afterFirstRelease.surfaces[surfaceId]?.target.tmuxPane, "%4");

  const final = await controller.submit(
    event("codex", "pane-four", "four-end", "session.ended", 4_000, {
      target: paneFour,
    }),
  );
  assert.equal(renderer.resets.length, 1);
  assert.equal(final.surfaces[surfaceId]?.phase, "inactive");
});

test("reconciles an expired attention owner before selecting a new session", async (context) => {
  const { controller, renderer } = await controllerFixture(context);
  const target = { surfaceId: "logical:recovered" };
  const leaseTtlMs = 30 * 60 * 1_000;

  await controller.submit(
    event("claude", "orphan", "orphan-failed", "turn.failed", 1_000, {
      generation: 1,
      target,
    }),
  );
  const state = await controller.submit(
    event(
      "codex",
      "replacement",
      "replacement-start",
      "turn.started",
      1_000 + leaseTtlMs + 1,
      { generation: 1, target },
    ),
  );

  assert.equal(state.sessions["claude:orphan"]?.phase, "inactive");
  assert.equal(state.sessions["claude:orphan"]?.reason, "reconciled-stale");
  assert.equal(state.surfaces[target.surfaceId]?.ownerKey, "codex:replacement");
  assert.equal(renderer.paints.at(-1)?.session.sessionId, "replacement");
});

test("bounds inactive surface history after repeated terminal churn", async (context) => {
  const { controller } = await controllerFixture(context);
  let state;
  for (let index = 0; index < 260; index += 1) {
    const target = { surfaceId: `logical:${index}` };
    await controller.submit(
      event("claude", `session-${index}`, `start-${index}`, "turn.started", index * 2 + 1, {
        target,
      }),
    );
    state = await controller.submit(
      event("claude", `session-${index}`, `end-${index}`, "session.ended", index * 2 + 2, {
        target,
      }),
    );
  }

  assert.equal(Object.keys(state?.surfaces ?? {}).length, 256);
  assert.equal(state?.surfaces["logical:0"], undefined);
  assert.equal(state?.surfaces["logical:259"]?.phase, "inactive");
});

test("notifies once for accepted attention events using the originating event", async (context) => {
  const notifier = new RecordingNotifier();
  const { controller, renderer } = await controllerFixture(context, notifier);

  await controller.submit(
    event("claude", "owner", "owner-failed", "turn.failed", 1_000, {
      generation: 2,
      turnId: "owner-turn",
    }),
  );
  const arriving = event(
    "codex",
    "arriving",
    "arriving-done",
    "turn.completed",
    2_000,
    { generation: 1, turnId: "arriving-turn" },
  );
  await controller.submit(arriving);

  assert.equal(renderer.paints.at(-1)?.session.sessionId, "owner");
  assert.deepEqual(notifier.events, [
    event("claude", "owner", "owner-failed", "turn.failed", 1_000, {
      generation: 2,
      turnId: "owner-turn",
    }),
    arriving,
  ]);

  const targetless = event(
    "codex",
    "targetless",
    "targetless-wait",
    "attention.waiting",
    3_000,
    { target: undefined },
  );
  await controller.submit(targetless);
  assert.strictEqual(notifier.events.at(-1), targetless);

  const cancelled = event(
    "codex",
    "targetless",
    "targetless-cancelled",
    "turn.cancelled",
    3_100,
    { target: undefined },
  );
  await controller.submit(cancelled);
  assert.strictEqual(notifier.events.at(-1), cancelled);
});

test("dedupes semantic wait notifications across provider transport events", async (context) => {
  const notifier = new RecordingNotifier();
  const { controller } = await controllerFixture(context, notifier);

  const firstWait = event(
    "claude",
    "permission",
    "permission-request",
    "attention.waiting",
    1_000,
  );
  await controller.submit(firstWait);
  await controller.submit(
    event(
      "claude",
      "permission",
      "delayed-permission-notification",
      "attention.waiting",
      8_000,
    ),
  );
  await controller.submit(
    event(
      "claude",
      "permission",
      "permission-acknowledged",
      "attention.acknowledged",
      9_000,
    ),
  );
  const secondWait = event(
    "claude",
    "permission",
    "second-permission-request",
    "attention.waiting",
    10_000,
  );
  await controller.submit(secondWait);

  assert.deepEqual(notifier.events, [firstWait, secondWait]);
});

test("does not notify for duplicates, stale events, starts, acknowledgements, or teardown", async (context) => {
  const notifier = new RecordingNotifier();
  const { controller } = await controllerFixture(context, notifier);

  await controller.submit(
    event("claude", "one", "start", "turn.started", 1_000, {
      generation: 2,
      turnId: "turn-2",
    }),
  );
  const completed = event(
    "claude",
    "one",
    "completed",
    "turn.completed",
    2_000,
    { generation: 2, turnId: "turn-2" },
  );
  await controller.submit(completed);
  await controller.submit(completed);
  await controller.submit(
    event("claude", "one", "stale", "turn.failed", 1_500, {
      generation: 1,
      turnId: "turn-1",
    }),
  );
  await controller.submit(
    event("claude", "one", "ack", "attention.acknowledged", 2_100, {
      generation: 2,
      turnId: "turn-2",
    }),
  );
  await controller.submit(
    event("claude", "one", "ended", "session.ended", 2_200, {
      generation: 2,
    }),
  );

  assert.deepEqual(notifier.events, [completed]);
});

test("commits accepted state when notification delivery throws", async (context) => {
  const notifier: EventNotifier = {
    async notify() {
      throw new Error("notification service unavailable");
    },
  };
  const { controller, store } = await controllerFixture(context, notifier);
  const completed = event(
    "claude",
    "one",
    "completed",
    "turn.completed",
    1_000,
  );

  const submitted = await controller.submit(completed);
  const persisted = await store.read();

  assert.equal(submitted.sessions["claude:one"]?.phase, "completed");
  assert.equal(persisted.sessions["claude:one"]?.phase, "completed");
  assert.deepEqual(persisted.seenEventIds, ["completed"]);
});
