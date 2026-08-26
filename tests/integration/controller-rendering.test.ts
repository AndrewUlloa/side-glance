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
import type { SideGlanceAppearance } from "../../src/core/appearance.ts";
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
  suppressed: boolean;
}

class RecordingRenderer implements SurfaceRenderer {
  readonly paints: PaintRecord[] = [];
  readonly resets: SideGlanceTarget[] = [];

  async paint(
    target: SideGlanceTarget,
    session: SideGlanceSessionState,
    visual: { wash: string; accent: string; urgency: number; suppressed: boolean },
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
  appearance: SideGlanceAppearance = { preset: "status" },
) {
  const directory = await mkdtemp(path.join(tmpdir(), "side-glance-controller-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const renderer = new RecordingRenderer();
  const store = new FileSideGlanceStore({
    directory,
    rootDirectory: path.dirname(directory),
  });
  const controller = new SideGlanceController(
    store,
    renderer,
    notifier,
    appearance,
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

test("renders semantic lifecycle states and keeps Ready distinct from failure", async (context) => {
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
      { phase: "completed", wash: "173326", accent: "3fa84e", urgency: 500 },
    ],
  );
  assert.equal(
    state.surfaces["tty:/dev/ttys001"]?.tmuxSnapshot?.windowId,
    "@7",
  );
});

test("paints Heat completion with the prior learned ceiling, then slides", async (context) => {
  const { controller, renderer } = await controllerFixture(
    context,
    undefined,
    { preset: "heat", ceiling: { mode: "adaptive" } },
  );

  for (let turn = 0; turn < 9; turn += 1) {
    const startedAt = turn * 1_000_000 + 1_000;
    await controller.submit(
      event("claude", "heat-learning", `heat-start-${turn}`, "turn.started", startedAt, {
        generation: turn + 1,
        turnId: `heat-turn-${turn}`,
      }),
    );
    await controller.submit(
      event(
        "claude",
        "heat-learning",
        `heat-done-${turn}`,
        "turn.completed",
        startedAt + 240_000,
        { generation: turn + 1, turnId: `heat-turn-${turn}` },
      ),
    );
    if (turn === 7) {
      await controller.submit(
        event(
          "claude",
          "heat-learning",
          "heat-done-7-duplicate",
          "turn.completed",
          startedAt + 240_000,
          { generation: 8, turnId: "heat-turn-7" },
        ),
      );
    }
  }

  const completions = renderer.paints.filter(
    ({ session }) => session.phase === "completed",
  );
  assert.equal(completions[7]?.session.completionCeilingSeconds, 300);
  assert.equal(completions[8]?.session.completionCeilingSeconds, 300);
  assert.equal(completions[9]?.session.completionCeilingSeconds, 360);
  assert.equal(completions[8]?.urgency, completions[7]?.urgency);
  assert.ok(
    (completions[8]?.urgency ?? 0) > (completions[9]?.urgency ?? 0),
    "the ninth completion must cool after the learned ceiling slides upward",
  );
});

test("suppresses quick Ready only when Heat is selected", async (context) => {
  const custom: SideGlanceAppearance = {
    preset: "custom",
    colors: {
      inactive: { wash: "111111", accent: "aaaaaa" },
      working: { wash: "122222", accent: "00aaaa" },
      waiting: { wash: "332200", accent: "ffaa00" },
      ready: { wash: "113311", accent: "44cc44" },
      failed: { wash: "331111", accent: "ff4444" },
    },
  };
  for (const [label, appearance, suppressed] of [
    ["status", { preset: "status" }, false],
    ["custom", custom, false],
    ["heat", { preset: "heat", ceiling: { mode: "adaptive" } }, true],
  ] as const) {
    const fixture = await controllerFixture(context, undefined, appearance);
    await fixture.controller.submit(
      event("claude", label, `${label}-start`, "turn.started", 1_000),
    );
    await fixture.controller.submit(
      event("claude", label, `${label}-done`, "turn.completed", 6_000),
    );
    assert.equal(fixture.renderer.paints.at(-1)?.suppressed, suppressed, label);
  }
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

test("a rejected stale start cannot expire or repaint unrelated sessions", async (context) => {
  const { controller, renderer } = await controllerFixture(context);
  const targetA = { surfaceId: "logical:stale-a" };
  const targetB = { surfaceId: "logical:stale-b" };
  await controller.submit(
    event("claude", "stale-a", "stale-a-start", "turn.started", 1_000, {
      generation: 5,
      turnId: "turn-5",
      target: targetA,
    }),
  );
  await controller.submit(
    event("codex", "stale-b", "stale-b-start", "turn.started", 2_000, {
      generation: 1,
      turnId: "turn-1",
      target: targetB,
    }),
  );
  const paintCount = renderer.paints.length;
  const resetCount = renderer.resets.length;

  const state = await controller.submit(
    event(
      "claude",
      "stale-a",
      "stale-a-old-start",
      "turn.started",
      2_000_000,
      { generation: 4, turnId: "turn-4", target: targetA },
    ),
  );

  assert.equal(state.sessions["codex:stale-b"]?.phase, "working");
  assert.equal(renderer.paints.length, paintCount);
  assert.equal(renderer.resets.length, resetCount);
});

test("session end prevents delayed child events from repainting", async (context) => {
  const { controller, renderer } = await controllerFixture(context);
  await controller.submit(
    event("claude", "ended", "ended-start", "turn.started", 1_000, {
      generation: 1,
      turnId: "ended-turn",
    }),
  );
  await controller.submit(
    event("claude", "ended", "ended-child", "work.started", 2_000, {
      generation: 1,
      turnId: "ended-turn",
      work: { id: "subagent:ended", kind: "subagent" },
    }),
  );
  const ended = await controller.submit(
    event("claude", "ended", "ended-session", "session.ended", 3_000),
  );
  const paintCount = renderer.paints.length;
  const resetCount = renderer.resets.length;

  const afterLateChild = await controller.submit(
    event("claude", "ended", "ended-child-late", "work.finished", 4_000, {
      generation: 1,
      turnId: "ended-turn",
      work: { id: "subagent:ended", kind: "subagent" },
    }),
  );

  assert.deepEqual(afterLateChild, ended);
  assert.equal(afterLateChild.sessions["claude:ended"]?.phase, "inactive");
  assert.equal(renderer.paints.length, paintCount);
  assert.equal(renderer.resets.length, resetCount);
});

test("manual reset cannot be undone by a delayed child event", async (context) => {
  const { controller, renderer } = await controllerFixture(context);
  await controller.submit(
    event("claude", "manual", "manual-start", "turn.started", 1_000, {
      generation: 1,
      turnId: "manual-turn",
    }),
  );
  await controller.submit(
    event("claude", "manual", "manual-child", "work.started", 2_000, {
      generation: 1,
      turnId: "manual-turn",
      work: { id: "subagent:manual", kind: "subagent" },
    }),
  );
  const reset = await controller.submit(
    event("claude", "manual", "manual-reset", "session.ended", 3_000, {
      reason: "manual-reset",
    }),
  );
  const paintCount = renderer.paints.length;
  const resetCount = renderer.resets.length;

  const afterLateChild = await controller.submit(
    event("claude", "manual", "manual-late", "work.finished", 4_000, {
      generation: 1,
      turnId: "manual-turn",
      work: { id: "subagent:manual", kind: "subagent" },
    }),
  );

  assert.deepEqual(afterLateChild, reset);
  assert.equal(renderer.paints.length, paintCount);
  assert.equal(renderer.resets.length, resetCount);
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

  const reactivated = await controller.submit(
    event(
      "claude",
      "orphan",
      "orphan-new-turn",
      "turn.started",
      1_000 + leaseTtlMs + 2,
      { generation: 2, target },
    ),
  );
  assert.equal(reactivated.sessions["claude:orphan"]?.phase, "working");
  assert.equal(reactivated.surfaces[target.surfaceId]?.ownerKey, "claude:orphan");
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

test("does not notify Ready from pre-final provider completion hooks", async (context) => {
  const notifier = new RecordingNotifier();
  const { controller } = await controllerFixture(context, notifier);

  await controller.submit(
    event("claude", "retrying", "start", "turn.started", 1_000),
  );
  const provisional = event(
    "claude",
    "retrying",
    "stop-hook",
    "turn.completed",
    2_000,
    { confidence: "heuristic" },
  );
  const state = await controller.submit(provisional);

  assert.equal(state.sessions["claude:retrying"].phase, "completed");
  assert.equal(state.sessions["claude:retrying"].confidence, "heuristic");
  assert.deepEqual(notifier.events, []);
});

test("does not notify Ready when completion inherits heuristic confidence", async (context) => {
  const notifier = new RecordingNotifier();
  const { controller } = await controllerFixture(context, notifier);

  await controller.submit(
    event("claude", "inherited-heuristic", "inherited-start", "turn.started", 1_000, {
      confidence: "heuristic",
    }),
  );
  const completion = event(
    "claude",
    "inherited-heuristic",
    "inherited-done",
    "turn.completed",
    2_000,
    { confidence: undefined },
  );
  const state = await controller.submit(completion);

  assert.equal(state.sessions["claude:inherited-heuristic"]?.confidence, "heuristic");
  assert.deepEqual(notifier.events, []);
});

test("does not paint or notify Ready while aggregate work remains", async (context) => {
  const notifier = new RecordingNotifier();
  const { controller, renderer } = await controllerFixture(context, notifier);

  await controller.submit(
    event("claude", "aggregate", "start", "turn.started", 1_000),
  );
  await controller.submit(
    event("claude", "aggregate", "child", "work.started", 2_000, {
      work: { id: "subagent:a", kind: "subagent" },
    }),
  );
  const provisional = event(
    "claude",
    "aggregate",
    "parent-stop-busy",
    "turn.completed",
    3_000,
    {
      activeWork: [{ id: "subagent:a", kind: "subagent" }],
      confidence: "native",
    },
  );
  const busy = await controller.submit(provisional);

  assert.equal(busy.sessions["claude:aggregate"]?.phase, "working");
  assert.equal(renderer.paints.at(-1)?.session.phase, "working");
  assert.deepEqual(notifier.events, []);

  await controller.submit(
    event("claude", "aggregate", "child-finished", "work.finished", 4_000, {
      work: { id: "subagent:a", kind: "subagent" },
    }),
  );
  const complete = event(
    "claude",
    "aggregate",
    "parent-stop-empty",
    "turn.completed",
    5_000,
    { activeWork: [], confidence: "native" },
  );
  const ready = await controller.submit(complete);

  assert.equal(ready.sessions["claude:aggregate"]?.phase, "completed");
  assert.deepEqual(notifier.events, [complete]);
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
