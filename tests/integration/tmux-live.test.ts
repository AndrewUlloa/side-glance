import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  applyTmuxPaint,
  captureTmuxSnapshot,
  createTmuxRunner,
  restoreTmuxSnapshot,
} from "../../src/renderers/tmux.ts";

const execFileAsync = promisify(execFile);
const runLive = process.env.SIDE_GLANCE_TEST_TMUX_LIVE === "1";

test(
  "round-trips real tmux local and inherited window options",
  { skip: !runLive },
  async (context) => {
    const executable = process.env.SIDE_GLANCE_TEST_TMUX_BIN ?? "tmux";
    const socketPath = path.join(
      tmpdir(),
      `side-glance-tmux-test-${process.pid}-${Date.now()}.sock`,
    );
    const tmux = (...args: string[]) =>
      execFileAsync(executable, ["-S", socketPath, ...args], {
        encoding: "utf8",
      });

    await tmux(
      "-f",
      "/dev/null",
      "new-session",
      "-d",
      "-s",
      "side-glance",
      "-n",
      "editor",
      "/bin/sleep",
      "60",
    );
    context.after(() => tmux("kill-server").catch(() => undefined));
    await tmux(
      "set-option",
      "-w",
      "-t",
      "side-glance:editor",
      "window-status-style",
      "fg=#123456,bold",
    );
    await tmux(
      "set-option",
      "-w",
      "-t",
      "side-glance:editor",
      "window-status-format",
      '#{?window_active,"yes","no"} #I:#W',
    );

    const { stdout: paneOutput } = await tmux(
      "display-message",
      "-p",
      "-t",
      "side-glance:editor",
      "#{pane_id}",
    );
    const runner = createTmuxRunner({ executable, socketPath });
    const snapshot = await captureTmuxSnapshot(runner, paneOutput.trim());

    await applyTmuxPaint(runner, snapshot, "f0a726", "waiting");
    await restoreTmuxSnapshot(runner, snapshot);

    const { stdout: style } = await tmux(
      "show-options",
      "-w",
      "-v",
      "-t",
      snapshot.windowId,
      "window-status-style",
    );
    const { stdout: format } = await tmux(
      "show-options",
      "-w",
      "-v",
      "-t",
      snapshot.windowId,
      "window-status-format",
    );
    const { stdout: inheritedCurrentStyle } = await tmux(
      "show-options",
      "-w",
      "-q",
      "-t",
      snapshot.windowId,
      "window-status-current-style",
    );

    assert.equal(style.trimEnd(), "fg=#123456,bold");
    assert.equal(format.trimEnd(), '#{?window_active,"yes","no"} #I:#W');
    assert.equal(inheritedCurrentStyle, "");
  },
);
