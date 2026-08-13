import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../../src/cli/entry.ts", import.meta.url));

interface CliResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

async function runCli(
  args: readonly string[],
  options: {
    input?: string;
    stateDirectory: string;
    env?: Record<string, string>;
  },
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        SIGNAL_STATE_DIR: options.stateDirectory,
        NO_COLOR: "1",
        ...options.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
    child.stdin.end(options.input);
  });
}

async function stateDirectory(context: test.TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "signal-cli-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("accepts a normalized event and reports status without prompt content", async (context) => {
  const directory = await stateDirectory(context);
  const payload = {
    v: 1,
    eventId: "event-1",
    source: "claude",
    sessionId: "session-1",
    kind: "turn.started",
    occurredAt: 1_000,
    generation: 1,
    turnId: "turn-1",
    confidence: "native",
    target: { surfaceId: "test:cli" },
  };

  const submitted = await runCli(["event", "--json"], {
    stateDirectory: directory,
    input: JSON.stringify(payload),
  });
  assert.equal(submitted.code, 0, submitted.stderr);
  assert.equal(JSON.parse(submitted.stdout).sessions["claude:session-1"].phase, "working");

  const status = await runCli(["status", "--json"], {
    stateDirectory: directory,
  });
  assert.equal(status.code, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).sessions["claude:session-1"].turnId, "turn-1");
  assert.equal(status.stdout.includes("prompt"), false);
});

test("adapts a provider-native hook payload through the executable", async (context) => {
  const directory = await stateDirectory(context);
  const result = await runCli(
    ["hook", "--provider", "claude", "--surface", "test:hook", "--json"],
    {
      stateDirectory: directory,
      input: JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        session_id: "claude-native-session",
        prompt: "private prompt",
      }),
    },
  );

  assert.equal(result.code, 0, result.stderr);
  const session = JSON.parse(result.stdout).sessions[
    "claude:claude-native-session"
  ];
  assert.equal(session.phase, "working");
  assert.equal(session.target.surfaceId, "test:hook");
  assert.equal(result.stdout.includes("private prompt"), false);
});

test("uses the wrapper-provided surface for an installed hook command", async (context) => {
  const directory = await stateDirectory(context);
  const result = await runCli(["hook", "--provider", "claude", "--json"], {
    stateDirectory: directory,
    env: { SIGNAL_SURFACE_ID: "test:wrapper-surface" },
    input: JSON.stringify({
      hook_event_name: "SessionStart",
      session_id: "claude-installed-hook",
    }),
  });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(
    JSON.parse(result.stdout).sessions["claude:claude-installed-hook"].target
      .surfaceId,
    "test:wrapper-surface",
  );
});

test("rejects malformed event JSON without creating executable state", async (context) => {
  const directory = await stateDirectory(context);
  const result = await runCli(["event", "--json"], {
    stateDirectory: directory,
    input: JSON.stringify({
      v: 1,
      eventId: "bad",
      source: "claude",
      sessionId: "../../owned",
      kind: "turn.started",
      occurredAt: "now",
      prompt: "$(touch owned)",
    }),
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /event|occurredAt|field/i);
});

test("doctor and preview are deterministic and do not require a live terminal", async (context) => {
  const directory = await stateDirectory(context);
  const doctor = await runCli(["doctor", "--json"], {
    stateDirectory: directory,
  });
  const preview = await runCli(
    ["preview", "--phase", "waiting", "--elapsed", "60", "--json"],
    { stateDirectory: directory },
  );

  assert.equal(doctor.code, 0, doctor.stderr);
  assert.equal(JSON.parse(doctor.stdout).stateDirectory, directory);
  assert.equal(JSON.parse(doctor.stdout).node.supported, true);
  assert.equal(preview.code, 0, preview.stderr);
  assert.deepEqual(JSON.parse(preview.stdout), {
    phase: "waiting",
    urgency: 500,
    wash: "3a2f16",
    accent: "e0a726",
  });
});

test("doctor inspects Claude and Codex plans without mutating existing configuration", async (context) => {
  const directory = await stateDirectory(context);
  const home = await mkdtemp(path.join(tmpdir(), "signal-doctor-home-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(path.join(home, ".claude"), { recursive: true });
  await mkdir(path.join(home, ".codex"), { recursive: true });
  const claudePath = path.join(home, ".claude", "settings.json");
  const codexHooksPath = path.join(home, ".codex", "hooks.json");
  const codexConfigPath = path.join(home, ".codex", "config.toml");
  await writeFile(
    claudePath,
    '{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"/usr/bin/existing"}]}]}}\n',
  );
  await writeFile(codexHooksPath, '{"hooks":{}}\n');
  await writeFile(
    codexConfigPath,
    'notify = ["SkyComputerUseClient", "agent-turn-complete"]\n',
  );
  const before = await Promise.all(
    [claudePath, codexHooksPath, codexConfigPath].map((file) => readFile(file, "utf8")),
  );

  const result = await runCli(["doctor", "--home", home, "--json"], {
    stateDirectory: directory,
  });

  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.providers.claude.valid, true);
  assert.equal(report.providers.claude.existingHookGroups, 1);
  assert.equal(report.providers.codex.valid, true);
  assert.equal(report.providers.codex.notifyConfigured, true);
  assert.equal(report.providers.codex.signalHooks, 0);
  assert.deepEqual(
    await Promise.all(
      [claudePath, codexHooksPath, codexConfigPath].map((file) => readFile(file, "utf8")),
    ),
    before,
  );
});

test("supervised run preserves child output and nonzero exit while cleaning its lease", async (context) => {
  const directory = await stateDirectory(context);
  const result = await runCli(
    [
      "run",
      "--surface",
      "test:wrapper",
      "--",
      process.execPath,
      "-e",
      'process.stdout.write("child-output"); process.exit(7)',
    ],
    { stateDirectory: directory },
  );

  assert.equal(result.code, 7, result.stderr);
  assert.equal(result.stdout, "child-output");
  const state = JSON.parse(
    await readFile(path.join(directory, "signal-state.json"), "utf8"),
  );
  const session = Object.values(state.sessions)[0] as {
    phase: string;
    reason?: string;
  };
  assert.equal(session.phase, "inactive");
  assert.equal(session.reason, "exit:7");
});

test("supervised run passes stable surface and session identity to provider hooks", async (context) => {
  const directory = await stateDirectory(context);
  const result = await runCli(
    [
      "run",
      "--surface",
      "test:inherited-surface",
      "--",
      process.execPath,
      "-e",
      "process.stdout.write(JSON.stringify({surface: process.env.SIGNAL_SURFACE_ID, session: process.env.SIGNAL_SESSION_ID}))",
    ],
    { stateDirectory: directory },
  );

  assert.equal(result.code, 0, result.stderr);
  const environment = JSON.parse(result.stdout);
  assert.equal(environment.surface, "test:inherited-surface");
  assert.match(environment.session, /^wrapper-/u);
});

test("supervised run can take its surface from the wrapper environment", async (context) => {
  const directory = await stateDirectory(context);
  const result = await runCli(
    [
      "run",
      "--",
      process.execPath,
      "-e",
      "process.stdout.write(process.env.SIGNAL_SURFACE_ID || '')",
    ],
    {
      stateDirectory: directory,
      env: { SIGNAL_SURFACE_ID: "test:auto-surface" },
    },
  );

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "test:auto-surface");
});

test("exposes transactional provider install and uninstall commands", async (context) => {
  const directory = await stateDirectory(context);
  const home = await mkdtemp(path.join(tmpdir(), "signal-cli-install-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const executable = path.join(home, "signal-bin");
  await import("node:fs/promises").then(async ({ chmod, writeFile }) => {
    await writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    await chmod(executable, 0o700);
  });

  const installed = await runCli(
    [
      "install",
      "claude",
      "--home",
      home,
      "--executable",
      executable,
      "--json",
    ],
    { stateDirectory: directory },
  );
  assert.equal(installed.code, 0, installed.stderr);
  assert.equal(JSON.parse(installed.stdout).changed, true);

  const uninstalled = await runCli(
    [
      "uninstall",
      "claude",
      "--home",
      home,
      "--executable",
      executable,
      "--json",
    ],
    { stateDirectory: directory },
  );
  assert.equal(uninstalled.code, 0, uninstalled.stderr);
  assert.equal(JSON.parse(uninstalled.stdout).installedHooks, 0);
});

test("refuses permanent provider activation from an ephemeral npm execution", async (context) => {
  const directory = await stateDirectory(context);
  const home = await mkdtemp(path.join(tmpdir(), "signal-npx-home-"));
  context.after(() => rm(home, { recursive: true, force: true }));

  const result = await runCli(
    ["install", "claude", "--home", home, "--executable", cliPath, "--json"],
    {
      stateDirectory: directory,
      env: { npm_command: "exec", npm_lifecycle_event: "npx" },
    },
  );

  assert.equal(result.code, 1);
  assert.match(result.stderr, /permanent|global|Homebrew|npm install/iu);
  await assert.rejects(
    () => readFile(path.join(home, ".claude", "settings.json"), "utf8"),
    /ENOENT/u,
  );
});

test(
  "supervised run forwards termination, records cleanup, and exits by the same signal",
  { skip: process.platform === "win32" },
  async (context) => {
    const directory = await stateDirectory(context);
    const result = await new Promise<CliResult>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          cliPath,
          "run",
          "--surface",
          "test:signal-forwarding",
          "--",
          process.execPath,
          "-e",
          'process.stdout.write("ready\\n"); setInterval(() => {}, 1_000)',
        ],
        {
          env: { ...process.env, SIGNAL_STATE_DIR: directory, NO_COLOR: "1" },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stdout = "";
      let stderr = "";
      let terminationSent = false;
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        if (!terminationSent && stdout.includes("ready\n")) {
          terminationSent = true;
          child.kill("SIGTERM");
        }
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
    });

    assert.equal(result.code, null, result.stderr);
    assert.equal(result.signal, "SIGTERM");
    const state = JSON.parse(
      await readFile(path.join(directory, "signal-state.json"), "utf8"),
    );
    const session = Object.values(state.sessions)[0] as {
      phase: string;
      reason?: string;
    };
    assert.equal(session.phase, "inactive");
    assert.equal(session.reason, "signal:SIGTERM");
  },
);

test("reset releases only the selected session", async (context) => {
  const directory = await stateDirectory(context);
  for (const sessionId of ["one", "two"]) {
    await runCli(["event", "--json"], {
      stateDirectory: directory,
      input: JSON.stringify({
        v: 1,
        eventId: `start-${sessionId}`,
        source: "generic",
        sessionId,
        kind: "turn.started",
        occurredAt: 1_000,
        generation: 1,
        confidence: "wrapper",
        target: { surfaceId: "test:shared" },
      }),
    });
  }

  const reset = await runCli(
    ["reset", "--source", "generic", "--session", "one", "--json"],
    { stateDirectory: directory },
  );
  assert.equal(reset.code, 0, reset.stderr);
  const sessions = JSON.parse(reset.stdout).sessions;
  assert.equal(sessions["generic:one"].phase, "inactive");
  assert.equal(sessions["generic:two"].phase, "working");
});

test("reset --all releases every tracked session after abnormal teardown", async (context) => {
  const directory = await stateDirectory(context);
  for (const [source, sessionId, surfaceId] of [
    ["claude", "orphan-one", "test:one"],
    ["codex", "orphan-two", "test:two"],
  ] as const) {
    const submitted = await runCli(["event", "--json"], {
      stateDirectory: directory,
      input: JSON.stringify({
        v: 1,
        eventId: `start-${sessionId}`,
        source,
        sessionId,
        kind: "turn.started",
        occurredAt: 1_000,
        confidence: "wrapper",
        target: { surfaceId },
      }),
    });
    assert.equal(submitted.code, 0, submitted.stderr);
  }

  const reset = await runCli(["reset", "--all", "--json"], {
    stateDirectory: directory,
  });

  assert.equal(reset.code, 0, reset.stderr);
  const state = JSON.parse(reset.stdout);
  assert.ok(Object.values(state.sessions).every(
    (session) => (session as { phase: string }).phase === "inactive",
  ));
  assert.ok(Object.values(state.surfaces).every(
    (surface) => (surface as { phase: string }).phase === "inactive",
  ));
});
