import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runInteractivePty } from "../helpers/interactive-pty.mjs";

const cliPath = fileURLToPath(new URL("../../src/cli/entry.ts", import.meta.url));

test(
  "a managed hook with piped stdio discovers and paints its provider PTY",
  { skip: process.platform === "win32" },
  async (context) => {
    const temporary = await mkdtemp(path.join(tmpdir(), "side-glance-direct-pty-"));
    context.after(() => rm(temporary, { recursive: true, force: true }));
    const provider = path.join(temporary, "provider.mjs");
    const stateDirectory = path.join(temporary, "state");
    await writeFile(
      provider,
      `import { spawnSync } from "node:child_process";
const hook = spawnSync(process.execPath, [${JSON.stringify(cliPath)}, "hook", "--provider", "codex", "--discover-terminal", "--json"], {
  detached: true,
  env: { ...process.env, SIDE_GLANCE_MANAGED_HOOK: "1", SIDE_GLANCE_STATE_DIR: ${JSON.stringify(stateDirectory)} },
  input: JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "direct-pty" }),
  encoding: "utf8",
});
process.stdout.write(hook.stdout ?? "");
process.stderr.write(hook.stderr ?? "");
process.exit(hook.status ?? 1);
`,
      { mode: 0o700 },
    );

    const result = await runInteractivePty({
      executable: process.execPath,
      arguments: [provider],
      cwd: temporary,
      environment: { NO_COLOR: "1", TERM: "xterm-256color" },
      interactions: [],
    });

    assert.equal(result.code, 0, result.output);
    assert.ok(
      result.output.includes("\u001b]11;#"),
      JSON.stringify(result.output),
    );
    assert.match(result.output, /#[0-9a-f]{6}/u);
    assert.ok(result.output.includes("\u001b\\"));
    assert.match(result.output, /\{\}/u);
  },
);
