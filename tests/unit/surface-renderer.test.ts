import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createDefaultSurfaceRenderer,
  isGoneSurfaceError,
  surfaceChannels,
  terminalTitleForPhase,
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

test("uses a bounded phase-only terminal title when explicitly enabled", () => {
  assert.equal(terminalTitleForPhase("working"), "Side Glance · Working");
  assert.equal(terminalTitleForPhase("completed"), "Side Glance · Ready");
  assert.equal(terminalTitleForPhase("waiting"), "Side Glance · Waiting");
  assert.equal(terminalTitleForPhase("failed"), "Side Glance · Failed");
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

test("does not paint tmux after a previously painted terminal disappears", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "side-glance-surface-"));
  const executable = path.join(directory, "tmux");
  const logPath = path.join(directory, "tmux.log");
  const originalPath = process.env.PATH;
  const originalLog = process.env.SIDE_GLANCE_TEST_TMUX_LOG;

  await writeFile(
    executable,
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$SIDE_GLANCE_TEST_TMUX_LOG"\n',
  );
  await chmod(executable, 0o755);
  process.env.PATH = `${directory}${path.delimiter}${originalPath ?? ""}`;
  process.env.SIDE_GLANCE_TEST_TMUX_LOG = logPath;

  const tmuxSnapshot = {
    windowId: "@7",
    options: [
      { name: "window-status-style" as const, local: false },
      { name: "window-status-current-style" as const, local: false },
      { name: "window-status-format" as const, local: false },
      { name: "window-status-current-format" as const, local: false },
    ],
  };
  const tty = "/dev/side-glance-terminal-that-does-not-exist";
  const target = {
    surfaceId: "tmux:/tmp/default,%3",
    tty,
    tmuxPane: "%3",
  };

  try {
    await assert.rejects(
      () =>
        createDefaultSurfaceRenderer().paint(
          target,
          {
            source: "codex",
            sessionId: "session-1",
            phase: "working",
            generation: 2,
            confidence: "native",
            target,
            updatedAt: 2_000,
          },
          {
            accent: "009d89",
            wash: "009d89",
            urgency: 0,
            suppressed: false,
          },
          {
            surfaceId: target.surfaceId,
            target,
            phase: "completed",
            generation: 1,
            updatedAt: 1_000,
            terminalPainted: true,
            tmuxSnapshot,
          },
        ),
      { name: "TerminalGoneError" },
    );
    assert.equal(existsSync(logPath), false);
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    if (originalLog === undefined) delete process.env.SIDE_GLANCE_TEST_TMUX_LOG;
    else process.env.SIDE_GLANCE_TEST_TMUX_LOG = originalLog;
    await rm(directory, { recursive: true, force: true });
  }
});

test("classifies a compensated tmux failure by its primary error", () => {
  const gone = Object.assign(new Error("no server running"), {
    code: "ENOENT",
  });
  const restoreGone = Object.assign(new Error("failed to connect"), {
    code: "ENOENT",
  });

  assert.equal(
    isGoneSurfaceError(
      new AggregateError([gone, restoreGone], "paint and restore failed"),
    ),
    true,
  );
  assert.equal(
    isGoneSurfaceError(
      new AggregateError(
        [new Error("unexpected paint bug"), restoreGone],
        "paint and restore failed",
      ),
    ),
    false,
  );
  assert.equal(
    isGoneSurfaceError(new Error("tmux paint failed", { cause: gone })),
    true,
  );
});
