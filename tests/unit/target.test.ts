import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  discoverOptionalTerminalTarget,
  discoverTerminalTarget,
  type TargetDiscoveryOptions,
} from "../../src/core/target.ts";

test("prefers an explicit wrapper surface and carries verified channels", async () => {
  assert.deepEqual(
    await discoverTerminalTarget({
      environment: {
        SIDE_GLANCE_SURFACE_ID: "tmux:/private/tmp/tmux-501/default,123,0,@7",
        SIDE_GLANCE_TTY: "/dev/ttys003",
        TMUX_PANE: "%3",
      },
      resolveTty: async () => {
        throw new Error("explicit tty should avoid discovery");
      },
    }),
    {
      surfaceId: "tmux:/private/tmp/tmux-501/default,123,0,@7",
      tty: "/dev/ttys003",
      tmuxPane: "%3",
    },
  );
});

test("maps every pane in one tmux window to one physical surface", async () => {
  const environment = {
    TMUX: "/private/tmp/tmux-501/default,123,0",
  };
  const paneThree = await discoverTerminalTarget({
    environment: { ...environment, TMUX_PANE: "%3" },
    resolveTmuxWindow: async (paneId: string) => {
      assert.equal(paneId, "%3");
      return "@7";
    },
  });
  const paneFour = await discoverTerminalTarget({
    environment: { ...environment, TMUX_PANE: "%4" },
    resolveTmuxWindow: async (paneId: string) => {
      assert.equal(paneId, "%4");
      return "@7";
    },
  });

  assert.equal(
    paneThree.surfaceId,
    "tmux:/private/tmp/tmux-501/default,123,@7",
  );
  assert.equal(paneFour.surfaceId, paneThree.surfaceId);
  assert.equal(paneThree.tmuxPane, "%3");
  assert.equal(paneFour.tmuxPane, "%4");
});

test("maps linked tmux sessions to one server-owned window surface", async () => {
  const discoverTmuxSurface = async (
    tmuxIdentity: string,
    windowId: string,
  ): Promise<string> =>
    (
      await discoverTerminalTarget({
        environment: { TMUX: tmuxIdentity, TMUX_PANE: "%3" },
        resolveTmuxWindow: async () => windowId,
      })
    ).surfaceId;

  const linkedSessionZero = await discoverTmuxSurface(
    "/private/tmp/tmux-501/linked,socket,123,0",
    "@7",
  );
  const linkedSessionNine = await discoverTmuxSurface(
    "/private/tmp/tmux-501/linked,socket,123,9",
    "@7",
  );

  assert.equal(
    linkedSessionZero,
    "tmux:/private/tmp/tmux-501/linked,socket,123,@7",
  );
  assert.equal(linkedSessionNine, linkedSessionZero);
  assert.notEqual(
    await discoverTmuxSurface(
      "/private/tmp/tmux-501/linked,socket,124,0",
      "@7",
    ),
    linkedSessionZero,
  );
  assert.notEqual(
    await discoverTmuxSurface(
      "/private/tmp/tmux-501/linked,socket,123,0",
      "@8",
    ),
    linkedSessionZero,
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

test("discovers the controlling tty with parent stdin and bounded subprocess channels", async () => {
  const stdout = new PassThrough();
  let closeListener: ((code: number | null) => void) | undefined;
  const options = {
    environment: {},
    spawnProcess: (command, arguments_, spawnOptions) => {
      assert.equal(command, "tty");
      assert.deepEqual(arguments_, []);
      assert.deepEqual(spawnOptions.stdio, [
        process.stdin,
        "pipe",
        "ignore",
      ]);
      queueMicrotask(() => {
        stdout.end("/dev/ttys003\n");
        closeListener?.(0);
      });
      return {
        stdout,
        kill: () => true,
        onClose: (listener: (code: number | null) => void) => {
          closeListener = listener;
        },
        onError: () => undefined,
      };
    },
  } satisfies TargetDiscoveryOptions;

  assert.deepEqual(await discoverTerminalTarget(options), {
    surfaceId: "tty:/dev/ttys003",
    tty: "/dev/ttys003",
  });
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
