import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
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
    stateDirectory?: string;
    env?: Record<string, string>;
  },
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        ...(options.stateDirectory
          ? { SIDE_GLANCE_STATE_DIR: options.stateDirectory }
          : {}),
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

test("migrates legacy default state into the Side Glance state location", async (context) => {
  const stateHome = await mkdtemp(path.join(tmpdir(), "side-glance-state-home-"));
  context.after(() => rm(stateHome, { recursive: true, force: true }));
  const legacyDirectory = path.join(stateHome, "signal");
  const payload = {
    v: 1,
    eventId: "legacy-event",
    source: "generic",
    sessionId: "legacy-session",
    kind: "turn.started",
    occurredAt: 1_000,
    confidence: "wrapper",
    target: { surfaceId: "test:legacy-state" },
  };
  const seeded = await runCli(["event", "--json"], {
    stateDirectory: legacyDirectory,
    input: JSON.stringify(payload),
  });
  assert.equal(seeded.code, 0, seeded.stderr);
  await rename(
    path.join(legacyDirectory, "side-glance-state.json"),
    path.join(legacyDirectory, "signal-state.json"),
  );

  const migrated = await runCli(["status", "--json"], {
    env: { XDG_STATE_HOME: stateHome },
  });

  assert.equal(migrated.code, 0, migrated.stderr);
  assert.equal(
    JSON.parse(migrated.stdout).sessions["generic:legacy-session"].phase,
    "working",
  );
  await readFile(
    path.join(stateHome, "side-glance", "side-glance-state.json"),
    "utf8",
  );
});

async function stateDirectory(context: test.TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "side-glance-cli-"));
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

test("accepts targetless notification hooks without writing terminal control bytes", async (context) => {
  const directory = await stateDirectory(context);
  const result = await runCli(
    [
      "hook",
      "--provider",
      "claude",
      "--notifications",
      "--notification-sound",
      "Glass",
      "--label",
      "API worker",
      "--json",
    ],
    {
      stateDirectory: directory,
      env: { SIDE_GLANCE_NOTIFICATION_BACKEND: "none" },
      input: JSON.stringify({
        hook_event_name: "Stop",
        session_id: "claude-targetless",
      }),
    },
  );

  assert.equal(result.code, 0, result.stderr);
  assert.equal(
    [String.fromCodePoint(0x1b), String.fromCodePoint(0x07)].some((control) =>
      result.stdout.includes(control),
    ),
    false,
  );
  const state = JSON.parse(result.stdout);
  assert.equal(state.sessions["claude:claude-targetless"].phase, "completed");
  assert.equal(state.sessions["claude:claude-targetless"].target, undefined);
});

test("exposes a targetless Aider notification bridge with inherited session identity", async (context) => {
  const directory = await stateDirectory(context);
  const result = await runCli(
    [
      "notify",
      "--source",
      "aider",
      "--kind",
      "completed",
      "--notification-sound",
      "Glass",
      "--json",
    ],
    {
      stateDirectory: directory,
      env: {
        SIDE_GLANCE_NOTIFICATION_BACKEND: "none",
        SIDE_GLANCE_SESSION_ID: "aider-wrapper-session",
        SIDE_GLANCE_LABEL: "Docs worker",
      },
    },
  );

  assert.equal(result.code, 0, result.stderr);
  const state = JSON.parse(result.stdout);
  assert.equal(state.sessions["aider:aider-wrapper-session"].phase, "completed");
  assert.equal(result.stdout.includes("Docs worker"), false);
});

test("uses the wrapper-provided surface for an installed hook command", async (context) => {
  const directory = await stateDirectory(context);
  const result = await runCli(["hook", "--provider", "claude", "--json"], {
    stateDirectory: directory,
    env: { SIDE_GLANCE_SURFACE_ID: "test:wrapper-surface" },
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
    urgency: 0,
    wash: "4d3510",
    accent: "f0a726",
  });
});

test("doctor inspects Claude and Codex plans without mutating existing configuration", async (context) => {
  const directory = await stateDirectory(context);
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-doctor-home-"));
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
  assert.equal(report.providers.codex.sideGlanceHooks, 0);
  assert.equal(report.notifications.providers.codex.topLevelNotify, true);
  assert.equal(report.notifications.providers.codex.status, "not-configured");
  assert.ok(["available", "unavailable", "unsupported"].includes(
    report.notifications.sideGlance.status,
  ));
  assert.deepEqual(
    await Promise.all(
      [claudePath, codexHooksPath, codexConfigPath].map((file) => readFile(file, "utf8")),
    ),
    before,
  );
});

test("doctor reports malformed provider notification settings instead of aborting", async (context) => {
  const directory = await stateDirectory(context);
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-doctor-malformed-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(path.join(home, ".gemini"), { recursive: true });
  await writeFile(path.join(home, ".gemini", "settings.json"), "{broken");

  const result = await runCli(["doctor", "--home", home, "--json"], {
    stateDirectory: directory,
  });

  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.providers.gemini.valid, false);
  assert.equal(report.notifications.providers.gemini.fileStatus, "malformed");
  assert.equal(report.notifications.providers.gemini.status, "unknown");
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
    await readFile(path.join(directory, "side-glance-state.json"), "utf8"),
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
      "process.stdout.write(JSON.stringify({surface: process.env.SIDE_GLANCE_SURFACE_ID, session: process.env.SIDE_GLANCE_SESSION_ID}))",
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
      "process.stdout.write(process.env.SIDE_GLANCE_SURFACE_ID || '')",
    ],
    {
      stateDirectory: directory,
      env: { SIDE_GLANCE_SURFACE_ID: "test:auto-surface" },
    },
  );

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "test:auto-surface");
});

test("supervised run accepts explicit exit notifications and passes a private label to bridges", async (context) => {
  const directory = await stateDirectory(context);
  const result = await runCli(
    [
      "run",
      "--surface",
      "test:notify-on-exit",
      "--notify-on-exit",
      "--notification-sound",
      "Glass",
      "--label",
      "Backend worker",
      "--",
      process.execPath,
      "-e",
      "process.stdout.write(process.env.SIDE_GLANCE_LABEL || '')",
    ],
    {
      stateDirectory: directory,
      env: { SIDE_GLANCE_NOTIFICATION_BACKEND: "none" },
    },
  );

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "Backend worker");
});

test("supervised run can pass a per-session sound to provider hooks without adding an exit alert", async (context) => {
  const directory = await stateDirectory(context);
  const result = await runCli(
    [
      "run",
      "--surface",
      "test:provider-sound",
      "--notification-sound",
      "Hero",
      "--",
      process.execPath,
      "-e",
      "process.stdout.write(process.env.SIDE_GLANCE_NOTIFICATION_SOUND || '')",
    ],
    {
      stateDirectory: directory,
      env: { SIDE_GLANCE_NOTIFICATION_BACKEND: "none" },
    },
  );

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "Hero");
});

test("supervised run releases an Aider bridge session that inherited its wrapper identity", async (context) => {
  const directory = await stateDirectory(context);
  const result = await runCli(
    [
      "run",
      "--surface",
      "test:aider-wrapper-cleanup",
      "--",
      process.execPath,
      cliPath,
      "notify",
      "--source",
      "aider",
      "--kind",
      "completed",
      "--json",
    ],
    {
      stateDirectory: directory,
      env: { SIDE_GLANCE_NOTIFICATION_BACKEND: "none" },
    },
  );

  assert.equal(result.code, 0, result.stderr);
  const state = JSON.parse(
    await readFile(path.join(directory, "side-glance-state.json"), "utf8"),
  );
  assert.equal(
    Object.values(state.sessions).every(
      (session) => (session as { phase: string }).phase === "inactive",
    ),
    true,
  );
  assert.equal(state.surfaces["test:aider-wrapper-cleanup"].phase, "inactive");
});

test("supervised run releases a provider-native session associated with its wrapper", async (context) => {
  const directory = await stateDirectory(context);
  const childProgram = [
    'import { spawnSync } from "node:child_process";',
    `const child = spawnSync(process.execPath, [${JSON.stringify(cliPath)}, "hook", "--provider", "claude", "--json"], {`,
    "env: process.env,",
    'encoding: "utf8",',
    'input: JSON.stringify({hook_event_name: "Stop", session_id: "native-claude-session"}),',
    "});",
    'process.stdout.write(child.stdout ?? "");',
    'process.stderr.write(child.stderr ?? "");',
    "process.exit(child.status ?? 1);",
  ].join("");
  const result = await runCli(
    [
      "run",
      "--surface",
      "test:native-wrapper-cleanup",
      "--",
      process.execPath,
      "--input-type=module",
      "-e",
      childProgram,
    ],
    { stateDirectory: directory },
  );

  assert.equal(result.code, 0, result.stderr);
  const state = JSON.parse(
    await readFile(path.join(directory, "side-glance-state.json"), "utf8"),
  );
  assert.match(
    state.sessions["claude:native-claude-session"].wrapperSessionId,
    /^wrapper-/u,
  );
  assert.equal(state.sessions["claude:native-claude-session"].phase, "inactive");
  assert.equal(
    state.sessions["claude:native-claude-session"].reason,
    "exit:0",
  );
});

test("exposes transactional provider install and uninstall commands", async (context) => {
  const directory = await stateDirectory(context);
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-cli-install-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const executable = path.join(home, "side-glance-bin");
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

test("installs notification-enabled provider hooks without changing unrelated settings", async (context) => {
  const directory = await stateDirectory(context);
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-cli-notify-install-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const executable = path.join(home, "side-glance-bin");
  await writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  await mkdir(path.join(home, ".gemini"), { recursive: true });
  const settingsPath = path.join(home, ".gemini", "settings.json");
  await writeFile(settingsPath, '{"general":{"enableNotifications":true}}\n');

  const installed = await runCli(
    [
      "install",
      "gemini",
      "--home",
      home,
      "--executable",
      executable,
      "--notifications",
      "--notification-sound",
      "Glass",
      "--json",
    ],
    { stateDirectory: directory },
  );

  assert.equal(installed.code, 0, installed.stderr);
  const installResult = JSON.parse(installed.stdout);
  assert.ok(
    installResult.warnings.some((warning: string) =>
      warning.includes("duplicate"),
    ),
  );
  const settings = JSON.parse(await readFile(settingsPath, "utf8"));
  assert.deepEqual(settings.general, { enableNotifications: true });
  const commands = Object.values(settings.hooks)
    .flatMap((groups) => groups as Array<{ hooks: Array<{ command: string }> }>)
    .flatMap((group) => group.hooks)
    .map((hook) => hook.command);
  assert.ok(commands.every((command) => command.includes(" --notifications")));
  assert.ok(
    commands.every((command) =>
      command.includes(" --notification-sound 'Glass'"),
    ),
  );
});

test("describes a Codex top-level notify command without claiming it is native", async (context) => {
  const directory = await stateDirectory(context);
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-cli-codex-notify-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const executable = path.join(home, "side-glance-bin");
  await writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  await mkdir(path.join(home, ".codex"), { recursive: true });
  await writeFile(
    path.join(home, ".codex", "config.toml"),
    'notify = ["existing-command"]\n',
  );

  const installed = await runCli(
    [
      "install",
      "codex",
      "--home",
      home,
      "--executable",
      executable,
      "--notifications",
      "--json",
    ],
    { stateDirectory: directory },
  );

  assert.equal(installed.code, 0, installed.stderr);
  const warnings = JSON.parse(installed.stdout).warnings as string[];
  assert.ok(
    warnings.some((warning) => warning.includes("top-level notify command")),
  );
  assert.ok(
    warnings.every(
      (warning) => !warning.includes("native notifications are already configured"),
    ),
  );
});

test("installs and removes the owned OpenCode notification plugin through the CLI", async (context) => {
  const directory = await stateDirectory(context);
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-cli-opencode-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const executable = path.join(home, "side-glance-bin");
  await writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });

  const installed = await runCli(
    [
      "install",
      "opencode",
      "--home",
      home,
      "--executable",
      executable,
      "--notifications",
      "--notification-sound",
      "Glass",
      "--json",
    ],
    { stateDirectory: directory },
  );
  assert.equal(installed.code, 0, installed.stderr);
  const result = JSON.parse(installed.stdout);
  assert.equal(result.provider, "opencode");
  assert.equal(result.installedHooks, 1);
  assert.match(await readFile(result.configPath, "utf8"), /--notifications/u);

  const removed = await runCli(
    [
      "uninstall",
      "opencode",
      "--home",
      home,
      "--executable",
      executable,
      "--json",
    ],
    { stateDirectory: directory },
  );
  assert.equal(removed.code, 0, removed.stderr);
  assert.equal(JSON.parse(removed.stdout).installedHooks, 0);
  await assert.rejects(() => readFile(result.configPath), /ENOENT/u);
});

test("refuses permanent provider activation from an ephemeral npm execution", async (context) => {
  const directory = await stateDirectory(context);
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-npx-home-"));
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
          "test:side-glance-forwarding",
          "--",
          process.execPath,
          "-e",
          'process.stdout.write("ready\\n"); setInterval(() => {}, 1_000)',
        ],
        {
          env: { ...process.env, SIDE_GLANCE_STATE_DIR: directory, NO_COLOR: "1" },
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
      await readFile(path.join(directory, "side-glance-state.json"), "utf8"),
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
