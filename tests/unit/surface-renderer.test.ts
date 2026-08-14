import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultSurfaceRenderer,
  surfaceChannels,
} from "../../src/renderers/surface.ts";

test("uses tmux status instead of a whole-client terminal wash inside tmux", () => {
  assert.deepEqual(
    surfaceChannels({
      surfaceId: "tmux:/tmp/tmux-501/default,%3",
      tty: "/dev/ttys007",
      tmuxPane: "%3",
    }),
    { terminal: false, tmux: true },
  );
});

test("uses the terminal wash only for a verified non-tmux TTY", () => {
  assert.deepEqual(
    surfaceChannels({
      surfaceId: "tty:/dev/ttys007",
      tty: "/dev/ttys007",
    }),
    { terminal: true, tmux: false },
  );
  assert.deepEqual(surfaceChannels({ surfaceId: "logical:test" }), {
    terminal: false,
    tmux: false,
  });
});

test("treats a terminal that disappeared before reset as already released", async () => {
  const tty = "/dev/ttys999999999";
  const target = { surfaceId: `tty:${tty}`, tty };

  await assert.doesNotReject(() =>
    createDefaultSurfaceRenderer().reset(target, {
      surfaceId: target.surfaceId,
      target,
      phase: "completed",
      generation: 1,
      updatedAt: 1_000,
      terminalPainted: true,
    }),
  );
});
