import assert from "node:assert/strict";
import test from "node:test";

import {
  discoverOptionalTerminalTarget,
  discoverTerminalTarget,
} from "../../src/core/target.ts";

test("prefers an explicit wrapper surface and carries verified channels", async () => {
  assert.deepEqual(
    await discoverTerminalTarget({
      environment: {
        SIDE_GLANCE_SURFACE_ID: "tmux:/private/tmp/tmux-501/default,%3",
        SIDE_GLANCE_TTY: "/dev/ttys003",
        TMUX_PANE: "%3",
      },
      resolveTty: async () => {
        throw new Error("explicit tty should avoid discovery");
      },
    }),
    {
      surfaceId: "tmux:/private/tmp/tmux-501/default,%3",
      tty: "/dev/ttys003",
      tmuxPane: "%3",
    },
  );
});

test("accepts legacy wrapper identity only as a fallback", async () => {
  assert.deepEqual(
    await discoverTerminalTarget({
      environment: {
        SIDE_GLANCE_SURFACE_ID: "test:current",
        SIGNAL_SURFACE_ID: "test:legacy",
        SIGNAL_TTY: "/dev/ttys004",
      },
    }),
    {
      surfaceId: "test:current",
      tty: "/dev/ttys004",
    },
  );
});

test("derives a stable surface from the controlling tty without a shell", async () => {
  assert.deepEqual(
    await discoverTerminalTarget({
      environment: {},
      resolveTty: async () => "/dev/ttys007",
    }),
    {
      surfaceId: "tty:/dev/ttys007",
      tty: "/dev/ttys007",
    },
  );
});

test("rejects invalid explicit device and pane identities", async () => {
  await assert.rejects(
    () =>
      discoverTerminalTarget({
        environment: {},
        tty: "/tmp/not-a-device",
        surfaceId: "test:unsafe",
      }),
    /tty|device/i,
  );
  await assert.rejects(
    () =>
      discoverTerminalTarget({
        environment: {},
        tmuxPane: "%3; run-shell owned",
        surfaceId: "test:unsafe",
      }),
    /pane/i,
  );
});

test("fails actionably when no controlling terminal exists", async () => {
  await assert.rejects(
    () =>
      discoverTerminalTarget({
        environment: {},
        resolveTty: async () => undefined,
      }),
    /terminal|surface/i,
  );
});

test("optional discovery permits targetless hooks but still rejects invalid explicit targets", async () => {
  assert.equal(
    await discoverOptionalTerminalTarget({
      environment: {},
      resolveTty: async () => undefined,
    }),
    undefined,
  );
  await assert.rejects(
    () =>
      discoverOptionalTerminalTarget({
        environment: {},
        surfaceId: "bad\nsurface",
        resolveTty: async () => undefined,
      }),
    /surface|control/i,
  );
});
