import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTmuxPaint,
  captureTmuxSnapshot,
  restoreTmuxSnapshot,
  type TmuxRunner,
} from "../../src/renderers/tmux.ts";

const SIDE_GLANCE_OPTIONS = [
  "window-status-style",
  "window-status-current-style",
  "window-status-format",
  "window-status-current-format",
] as const;

class FakeTmuxRunner implements TmuxRunner {
  readonly commands: string[][] = [];
  readonly local = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [name, value] of Object.entries(initial)) {
      this.local.set(name, value);
    }
  }

  async run(args: readonly string[]): Promise<{ stdout: string }> {
    this.commands.push([...args]);
    if (args[0] === "display-message") return { stdout: "@7\n" };

    if (args[0] === "show-options") {
      const option = args.at(-1) ?? "";
      const value = this.local.get(option);
      if (value === undefined) return { stdout: "" };
      return args.includes("-v")
        ? { stdout: `${value}\n` }
        : { stdout: `${option} ${JSON.stringify(value)}\n` };
    }

    if (args[0] === "set-option") {
      const unset = args.includes("-u");
      const optionIndex = args.findIndex((value) =>
        SIDE_GLANCE_OPTIONS.includes(value as (typeof SIDE_GLANCE_OPTIONS)[number]),
      );
      const option = args[optionIndex];
      if (unset) this.local.delete(option);
      else this.local.set(option, args[optionIndex + 1] ?? "");
      return { stdout: "" };
    }

    throw new Error(`Unexpected tmux command: ${args.join(" ")}`);
  }
}

test("restores local tmux styles and formats byte-for-byte", async () => {
  const original = {
    "window-status-style": "fg=#123456,bold",
    "window-status-format": '#{?window_active,"yes","no"} #I:#W',
  };
  const runner = new FakeTmuxRunner(original);
  const snapshot = await captureTmuxSnapshot(runner, "%3");

  await applyTmuxPaint(runner, snapshot, "f0a726", "waiting");
  assert.notDeepEqual(Object.fromEntries(runner.local), original);

  await restoreTmuxSnapshot(runner, snapshot);
  assert.deepEqual(Object.fromEntries(runner.local), original);
});

test("returns inherited options to inheritance instead of copying values", async () => {
  const runner = new FakeTmuxRunner();
  const snapshot = await captureTmuxSnapshot(runner, "%3");

  assert.ok(snapshot.options.every((option) => option.local === false));
  await applyTmuxPaint(runner, snapshot, "009d89", "working");
  assert.equal(runner.local.size, 4);

  await restoreTmuxSnapshot(runner, snapshot);
  assert.equal(runner.local.size, 0);
  assert.ok(
    runner.commands
      .filter((args) => args[0] === "set-option" && args.includes("-u"))
      .every((args) => args.includes("-w") && args.includes("@7")),
  );
});

test("rejects pane, window, and color injection", async () => {
  const runner = new FakeTmuxRunner();
  await assert.rejects(
    () => captureTmuxSnapshot(runner, "%3; run-shell owned"),
    /pane/i,
  );
  await assert.rejects(
    () =>
      applyTmuxPaint(
        runner,
        { windowId: "@7; run-shell owned", options: [] },
        "009d89",
        "working",
      ),
    /window/i,
  );
  await assert.rejects(
    () =>
      applyTmuxPaint(
        runner,
        { windowId: "@7", options: [] },
        "009d89;run-shell owned",
        "working",
      ),
    /color/i,
  );
});

test("uses distinct bounded phase markers independent of color", async () => {
  const runner = new FakeTmuxRunner();
  const snapshot = await captureTmuxSnapshot(runner, "%3");

  await applyTmuxPaint(runner, snapshot, "f33533", "completed");
  const completed = runner.local.get("window-status-current-format");
  await applyTmuxPaint(runner, snapshot, "f33533", "failed");
  const failed = runner.local.get("window-status-current-format");

  assert.match(completed ?? "", /✓/u);
  assert.match(failed ?? "", /×/u);
  assert.notEqual(completed, failed);
});
