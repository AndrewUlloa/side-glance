import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  SignalController,
  type SurfaceRenderer,
  type SurfaceRenderResult,
} from "../../src/core/controller.ts";
import type {
  SignalEvent,
  SignalSessionState,
  SignalTarget,
} from "../../src/core/protocol.ts";
import { FileSignalStore } from "../../src/core/store.ts";

interface PaintRecord {
  target: SignalTarget;
  session: SignalSessionState;
  wash: string;
  accent: string;
  urgency: number;
}

class RecordingRenderer implements SurfaceRenderer {
  readonly paints: PaintRecord[] = [];
  readonly resets: SignalTarget[] = [];

  async paint(
    target: SignalTarget,
    session: SignalSessionState,
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

  async reset(target: SignalTarget) {
    this.resets.push(target);
  }
}

async function controllerFixture(context: test.TestContext) {
  const directory = await mkdtemp(path.join(tmpdir(), "signal-controller-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const renderer = new RecordingRenderer();
  const controller = new SignalController(
    new FileSignalStore({ directory }),
    renderer,
  );
  return { controller, renderer };
}

function event(
  source: "claude" | "codex",
  sessionId: string,
  eventId: string,
  kind: SignalEvent["kind"],
  occurredAt: number,
  overrides: Partial<SignalEvent> = {},
): SignalEvent {
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

  await controller.submit(
    event("claude", "one", "start", "turn.started", 1_000, {
      generation: 1,
      turnId: "turn-1",
    }),
  );
  await controller.submit(
    event("claude", "one", "wait", "attention.waiting", 1_010, {
      generation: 1,
      turnId: "turn-1",
    }),
  );
  const state = await controller.submit(
    event("claude", "one", "done", "turn.completed", 1_060, {
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
