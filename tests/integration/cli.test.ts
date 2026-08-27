import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { inspectProviderCapabilities } from "../../src/cli/doctor.ts";
import { inspectNotificationReadiness } from "../../src/notifications/inspection.ts";

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

test("version and help never inspect runtime configuration", async () => {
  const env = { SIDE_GLANCE_CONFIG_DIR: "relative-must-not-be-inspected" };
  const version = await runCli(["--version"], { env });
  const help = await runCli(["--help"], { env });

  assert.equal(version.code, 0, version.stderr);
  assert.match(version.stdout, /^(?:development|\d+\.\d+\.\d+)/u);
  assert.equal(help.code, 0, help.stderr);
  assert.match(help.stdout, /side-glance theme/u);
});

test("CLI overrides reject intermediate linked state and config parents", async (context) => {
  const root = await stateDirectory(context);
  const outside = path.join(root, "outside");
  const alias = path.join(root, "alias");
  await mkdir(outside);
  await symlink(outside, alias, "dir");

  const state = await runCli(["status", "--json"], {
    env: { SIDE_GLANCE_STATE_DIR: path.join(alias, "state") },
  });
  assert.equal(state.code, 1);
  assert.match(state.stderr, /link/iu);

  const config = await runCli(
    ["theme", "set", "status", "--yes", "--json"],
    {
      env: {
        SIDE_GLANCE_STATE_DIR: path.join(root, "safe-state"),
        SIDE_GLANCE_CONFIG_DIR: path.join(alias, "config"),
      },
    },
  );
  assert.equal(config.code, 1);
  assert.match(config.stderr, /link/iu);
  assert.deepEqual(await readdir(outside), []);
});

test("acknowledges a normalized event minimally and reports status without prompt content", async (context) => {
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
  assert.equal(submitted.stdout, "{}\n");

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
  assert.equal(result.stdout, "");
  const status = await runCli(["status", "--json"], {
    stateDirectory: directory,
  });
  const session = JSON.parse(status.stdout).sessions[
    "claude:claude-native-session"
  ];
  assert.equal(session.phase, "working");
  assert.equal(session.target.surfaceId, "test:hook");
  assert.equal(status.stdout.includes("private prompt"), false);
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
  assert.equal(result.stdout, "");
  const status = await runCli(["status", "--json"], {
    stateDirectory: directory,
  });
  const state = JSON.parse(status.stdout);
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
  assert.equal(result.stdout, "{}\n");
  const status = await runCli(["status", "--json"], {
    stateDirectory: directory,
  });
  const state = JSON.parse(status.stdout);
  assert.equal(state.sessions["aider:aider-wrapper-session"].phase, "completed");
  assert.equal(result.stdout.includes("Docs worker"), false);

  const undocumentedHook = await runCli(
    ["hook", "--provider", "aider", "--notifications", "--json"],
    {
      stateDirectory: directory,
      input: JSON.stringify({ event: "response-complete" }),
      env: { SIDE_GLANCE_NOTIFICATION_BACKEND: "none" },
    },
  );
  assert.equal(undocumentedHook.code, 1);
  assert.match(undocumentedHook.stderr, /Unsupported hook provider: aider/u);
});

test("managed Codex hooks fail open when the hook subprocess has no terminal", async (context) => {
  const directory = await stateDirectory(context);
  const result = await runCli(["hook", "--provider", "codex", "--json"], {
    stateDirectory: directory,
    env: { SIDE_GLANCE_MANAGED_HOOK: "1" },
    input: JSON.stringify({
      hook_event_name: "UserPromptSubmit",
      session_id: "codex-targetless-managed-hook",
    }),
  });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "{}\n");
  const status = await runCli(["status", "--json"], {
    stateDirectory: directory,
  });
  const session = JSON.parse(status.stdout).sessions[
    "codex:codex-targetless-managed-hook"
  ];
  assert.equal(session.phase, "working");
  assert.equal(session.target, undefined);
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
  assert.equal(result.stdout, "");
  const status = await runCli(["status", "--json"], {
    stateDirectory: directory,
  });
  assert.equal(
    JSON.parse(status.stdout).sessions["claude:claude-installed-hook"].target
      .surfaceId,
    "test:wrapper-surface",
  );
});

test("keeps Claude Working across the installed subagent hook sequence", async (context) => {
  const directory = await stateDirectory(context);
  const sessionId = "claude-aggregate-hooks";
  const submit = (payload: Record<string, unknown>) =>
    runCli(
      ["hook", "--provider", "claude", "--surface", "test:aggregate", "--json"],
      {
        stateDirectory: directory,
        input: JSON.stringify({ session_id: sessionId, ...payload }),
      },
    );

  for (const payload of [
    { hook_event_name: "UserPromptSubmit" },
    { hook_event_name: "SubagentStart", agent_id: "agent-a" },
    {
      hook_event_name: "Stop",
      background_tasks: [],
      session_crons: [],
    },
  ]) {
    const result = await submit(payload);
    assert.equal(result.code, 0, result.stderr);
  }

  let status = await runCli(["status", "--json"], {
    stateDirectory: directory,
  });
  assert.equal(
    JSON.parse(status.stdout).sessions[`claude:${sessionId}`].phase,
    "working",
  );

  for (const payload of [
    {
      hook_event_name: "SubagentStop",
      agent_id: "agent-a",
      background_tasks: [{ id: "background-b" }],
      session_crons: [],
    },
    { hook_event_name: "Stop" },
  ]) {
    const result = await submit(payload);
    assert.equal(result.code, 0, result.stderr);
  }

  status = await runCli(["status", "--json"], {
    stateDirectory: directory,
  });
  const busySession = JSON.parse(status.stdout).sessions[`claude:${sessionId}`];
  assert.equal(busySession.phase, "working");
  assert.deepEqual(busySession.activeWork, [
    { id: "background:background-b", kind: "background-task" },
  ]);

  const finalStop = await submit({
    hook_event_name: "Stop",
    background_tasks: [],
    session_crons: [],
  });
  assert.equal(finalStop.code, 0, finalStop.stderr);

  status = await runCli(["status", "--json"], {
    stateDirectory: directory,
  });
  assert.equal(
    JSON.parse(status.stdout).sessions[`claude:${sessionId}`].phase,
    "completed",
  );
});

test("emits only an empty JSON acknowledgement for Gemini hooks", async (context) => {
  const directory = await stateDirectory(context);
  const result = await runCli(
    ["hook", "--provider", "gemini", "--surface", "test:gemini", "--json"],
    {
      stateDirectory: directory,
      input: JSON.stringify({
        hook_event_name: "BeforeAgent",
        session_id: "gemini-session",
      }),
    },
  );

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "{}\n");
  assert.equal(result.stdout.includes("session"), false);
});

test("accepts terminal title as a boolean lifecycle option", async (context) => {
  const directory = await stateDirectory(context);
  const eventPayload = {
    v: 1,
    eventId: "title-event",
    source: "generic",
    sessionId: "title-event-session",
    kind: "turn.started",
    occurredAt: 1_000,
    confidence: "wrapper",
    target: { surfaceId: "test:title-event" },
  };
  const invocations = [
    runCli(["event", "--terminal-title", "--json"], {
      stateDirectory: directory,
      input: JSON.stringify(eventPayload),
    }),
    runCli(
      [
        "hook",
        "--provider",
        "gemini",
        "--surface",
        "test:title-hook",
        "--terminal-title",
        "--json",
      ],
      {
        stateDirectory: directory,
        input: JSON.stringify({
          hook_event_name: "BeforeAgent",
          session_id: "title-hook-session",
        }),
      },
    ),
    runCli(
      [
        "notify",
        "--source",
        "aider",
        "--kind",
        "completed",
        "--session",
        "title-notify-session",
        "--surface",
        "test:title-notify",
        "--terminal-title",
        "--json",
      ],
      {
        stateDirectory: directory,
        env: { SIDE_GLANCE_NOTIFICATION_BACKEND: "none" },
      },
    ),
  ];

  for (const result of await Promise.all(invocations)) {
    assert.equal(result.code, 0, result.stderr);
  }

  const unknown = await runCli(
    ["event", "--terminal-title", "--unknown", "--json"],
    { stateDirectory: directory, input: JSON.stringify(eventPayload) },
  );
  assert.equal(unknown.code, 1);
  assert.match(unknown.stderr, /unknown option/u);
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
  const env = {
    SIDE_GLANCE_CONFIG_DIR: path.join(directory, "appearance"),
  };
  const doctor = await runCli(["doctor", "--json"], {
    env,
    stateDirectory: directory,
  });
  const preview = await runCli(
    ["preview", "--phase", "waiting", "--elapsed", "60", "--json"],
    { env, stateDirectory: directory },
  );

  assert.equal(doctor.code, 0, doctor.stderr);
  assert.equal(JSON.parse(doctor.stdout).stateDirectory, await realpath(directory));
  assert.equal(JSON.parse(doctor.stdout).node.supported, true);
  assert.equal(preview.code, 0, preview.stderr);
  assert.deepEqual(JSON.parse(preview.stdout), {
    phase: "waiting",
    urgency: 0,
    wash: "4d3510",
    accent: "f0a726",
    suppressed: false,
    completionCeilingSeconds: 300,
    completionCeilingBasis: "semantic-default",
  });
});

test("legacy preview uses saved Heat suppression and provider-local ceilings", async (context) => {
  const directory = await stateDirectory(context);
  const configDirectory = path.join(directory, "appearance");
  const env = { SIDE_GLANCE_CONFIG_DIR: configDirectory };
  const configured = await runCli(
    ["theme", "set", "heat", "--ceiling", "adaptive", "--yes", "--json"],
    { env, stateDirectory: directory },
  );
  assert.equal(configured.code, 0, configured.stderr);
  await writeFile(
    path.join(directory, "side-glance-state.json"),
    `${JSON.stringify({
      schemaVersion: 2,
      sessions: {},
      surfaces: {},
      seenEventIds: [],
      durationProfiles: {
        claude: {
          algorithmVersion: 1,
          samplesSeconds: Array.from({ length: 8 }, () => 400),
          ceilingSeconds: 360,
        },
        codex: {
          algorithmVersion: 1,
          samplesSeconds: Array.from({ length: 8 }, () => 160),
          ceilingSeconds: 270,
        },
      },
    })}\n`,
    { mode: 0o600 },
  );

  const coldStart = await runCli(
    ["preview", "--phase", "completed", "--elapsed", "5", "--json"],
    { env, stateDirectory: directory },
  );
  assert.equal(coldStart.code, 0, coldStart.stderr);
  assert.equal(JSON.parse(coldStart.stdout).suppressed, true);
  assert.equal(
    JSON.parse(coldStart.stdout).completionCeilingBasis,
    "cold-start-hypothetical",
  );

  const claude = await runCli(
    [
      "preview",
      "--phase",
      "completed",
      "--elapsed",
      "300",
      "--source",
      "claude",
      "--json",
    ],
    { env, stateDirectory: directory },
  );
  const codex = await runCli(
    [
      "preview",
      "--phase",
      "completed",
      "--elapsed",
      "300",
      "--source",
      "codex",
      "--json",
    ],
    { env, stateDirectory: directory },
  );
  assert.equal(claude.code, 0, claude.stderr);
  assert.equal(codex.code, 0, codex.stderr);
  assert.deepEqual(
    {
      source: JSON.parse(claude.stdout).source,
      ceiling: JSON.parse(claude.stdout).completionCeilingSeconds,
      basis: JSON.parse(claude.stdout).completionCeilingBasis,
    },
    { source: "claude", ceiling: 360, basis: "provider-profile" },
  );
  assert.deepEqual(
    {
      source: JSON.parse(codex.stdout).source,
      ceiling: JSON.parse(codex.stdout).completionCeilingSeconds,
      basis: JSON.parse(codex.stdout).completionCeilingBasis,
    },
    { source: "codex", ceiling: 270, basis: "provider-profile" },
  );
  assert.notEqual(
    JSON.parse(claude.stdout).urgency,
    JSON.parse(codex.stdout).urgency,
  );
});

test("theme automation can show, set adaptive Heat, preview, and reset", async (context) => {
  const directory = await stateDirectory(context);
  const configDirectory = path.join(directory, "appearance");
  const env = { SIDE_GLANCE_CONFIG_DIR: configDirectory };

  for (const payload of [
    {
      v: 1,
      eventId: "theme-duration-start",
      source: "claude",
      sessionId: "theme-duration",
      kind: "turn.started",
      occurredAt: 1_000,
      confidence: "native",
    },
    {
      v: 1,
      eventId: "theme-duration-done",
      source: "claude",
      sessionId: "theme-duration",
      kind: "turn.completed",
      occurredAt: 61_000,
      confidence: "native",
    },
  ]) {
    const seeded = await runCli(["event", "--json"], {
      input: JSON.stringify(payload),
      stateDirectory: directory,
    });
    assert.equal(seeded.code, 0, seeded.stderr);
  }

  const initial = await runCli(["theme", "show", "--json"], {
    env,
    stateDirectory: directory,
  });
  assert.equal(initial.code, 0, initial.stderr);
  const shown = JSON.parse(initial.stdout);
  assert.equal(shown.config.appearance.preset, "status");
  assert.deepEqual(shown.learnedCeilings, {
    claude: { sampleCount: 1, completionCeilingSeconds: 300 },
  });

  const set = await runCli(
    ["theme", "set", "heat", "--ceiling", "adaptive", "--yes", "--json"],
    { env, stateDirectory: directory },
  );
  assert.equal(set.code, 0, set.stderr);
  assert.deepEqual(JSON.parse(set.stdout).config.appearance, {
    preset: "heat",
    ceiling: { mode: "adaptive" },
  });

  const preview = await runCli(
    [
      "theme",
      "preview",
      "--preset",
      "heat",
      "--elapsed",
      "600",
      "--ceiling",
      "360",
      "--json",
    ],
    { env, stateDirectory: directory },
  );
  assert.equal(preview.code, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).visual.accent, "f33533");
  assert.equal(JSON.parse(preview.stdout).completionCeilingSeconds, 360);

  const quickHeat = await runCli(
    ["theme", "preview", "--preset", "heat", "--elapsed", "5", "--json"],
    { env, stateDirectory: directory },
  );
  assert.equal(quickHeat.code, 0, quickHeat.stderr);
  assert.equal(JSON.parse(quickHeat.stdout).visual.suppressed, true);

  const reset = await runCli(["theme", "reset", "--yes", "--json"], {
    env,
    stateDirectory: directory,
  });
  assert.equal(reset.code, 0, reset.stderr);
  assert.equal(JSON.parse(reset.stdout).config.appearance.preset, "status");

  const customPairs = [
    "--inactive",
    "111111:aaaaaa",
    "--working",
    "122222:00aaaa",
    "--waiting",
    "332200:ffaa00",
    "--ready",
    "113311:44cc44",
    "--failed",
    "331111:ff4444",
  ];
  const custom = await runCli(
    ["theme", "set", "custom", ...customPairs, "--yes", "--json"],
    { env, stateDirectory: directory },
  );
  assert.equal(custom.code, 0, custom.stderr);
  assert.deepEqual(JSON.parse(custom.stdout).config.appearance, {
    preset: "custom",
    colors: {
      inactive: { wash: "111111", accent: "aaaaaa" },
      working: { wash: "122222", accent: "00aaaa" },
      waiting: { wash: "332200", accent: "ffaa00" },
      ready: { wash: "113311", accent: "44cc44" },
      failed: { wash: "331111", accent: "ff4444" },
    },
  });

  const themeHelp = await runCli(["theme", "--help"], {
    env,
    stateDirectory: directory,
  });
  assert.equal(themeHelp.code, 0, themeHelp.stderr);
  assert.match(themeHelp.stdout, /Status[\s\S]*Heat[\s\S]*Custom/u);
  assert.match(themeHelp.stdout, /60[\s\S]*7200/u);
});

test("doctor reports invalid appearance while preserving safe Status fallback", async (context) => {
  const directory = await stateDirectory(context);
  const configDirectory = path.join(directory, "invalid-appearance");
  await mkdir(configDirectory, { recursive: true });
  const configPath = path.join(configDirectory, "config.json");
  const invalid = '{"schemaVersion":1,"appearance":{"preset":"private-invalid"}}';
  await writeFile(configPath, invalid);

  const result = await runCli(["doctor", "--home", directory, "--json"], {
    env: { SIDE_GLANCE_CONFIG_DIR: configDirectory },
    stateDirectory: directory,
  });

  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.appearance.valid, false);
  assert.equal(report.appearance.config.appearance.preset, "status");
  assert.match(report.appearance.error, /preset/u);
  assert.equal(await readFile(configPath, "utf8"), invalid);
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
  assert.equal(report.notifications.providers.codex.status, "ready");
  assert.equal(report.notifications.providers.codex.effectiveDefault, true);
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

test("doctor separates provider capabilities without claiming live verification", async (context) => {
  const directory = await stateDirectory(context);
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-capabilities-home-"));
  const bin = path.join(home, "bin");
  context.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(bin, { recursive: true });
  for (const name of ["claude", "codex", "gemini", "opencode", "aider"]) {
    const executable = path.join(bin, name);
    await writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    await chmod(executable, 0o700);
  }
  await writeFile(
    path.join(home, ".aider.conf.yml"),
    "notifications-command: 'side-glance notify --source aider --kind completed --json'\n",
  );

  const result = await runCli(["doctor", "--home", home, "--json"], {
    stateDirectory: directory,
    env: {
      PATH: bin,
      OPENCODE_CONFIG_DIR: path.join(home, "opencode-override"),
    },
  });

  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(report.capabilities.providers), [
    "claude",
    "codex",
    "gemini",
    "opencode",
    "aider",
  ]);
  assert.equal(report.capabilities.providers.claude.binary.present, true);
  assert.equal(
    report.capabilities.providers.claude.adapterContract.status,
    "contract-audited",
  );
  assert.equal(
    report.capabilities.providers.gemini.adapterContract.status,
    "experimental",
  );
  assert.equal(
    report.capabilities.providers.codex.nativeNotifications.status,
    "ready",
  );
  assert.equal(
    report.capabilities.providers.aider.integration.status,
    "configured",
  );
  assert.equal(
    report.capabilities.providers.aider.integration.source,
    "user-config",
  );
  assert.deepEqual(
    report.capabilities.providers.opencode.overrides.detected,
    ["OPENCODE_CONFIG_DIR"],
  );
  assert.equal(
    report.capabilities.providers.opencode.stableSurface.status,
    "wrapper-required",
  );
  for (const capability of Object.values(
    report.capabilities.providers,
  ) as Array<{ liveVerification: { status: string } }>) {
    assert.equal(capability.liveVerification.status, "not-run");
  }
});

test("doctor reads Aider config through one verified no-follow handle", async (context) => {
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-aider-handle-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const configPath = path.join(home, ".aider.conf.yml");
  const source = Buffer.from(
    "notifications-command: side-glance notify --source aider --kind completed --json\n",
  );
  const operations: string[] = [];
  let openedPath: string | undefined;
  let openedFlags: number | undefined;
  const notifications = await inspectNotificationReadiness({
    homeDirectory: home,
    platform: process.platform,
    pathProbe: async () => false,
    backendHints: { desktopSession: false },
  });

  const inspection = await inspectProviderCapabilities({
    homeDirectory: home,
    environment: {},
    pathProbe: async () => false,
    hooks: {},
    notifications,
    openAiderConfig: async (filePath: string, flags: number) => {
      operations.push("open");
      openedPath = filePath;
      openedFlags = flags;
      return {
        async stat() {
          operations.push("stat");
          return { isFile: () => true, size: source.byteLength };
        },
        async read(
          buffer: Uint8Array,
          offset: number,
          length: number,
          position: number,
        ) {
          operations.push("read");
          const bytesRead = Math.max(
            0,
            Math.min(length, source.byteLength - position),
          );
          buffer.set(source.subarray(position, position + bytesRead), offset);
          return { bytesRead };
        },
        async close() {
          operations.push("close");
        },
      };
    },
  });

  assert.equal(
    (
      inspection.providers.aider as {
        integration: { status: string };
      }
    ).integration.status,
    "configured",
  );
  assert.equal(openedPath, configPath);
  assert.equal(openedFlags, constants.O_RDONLY | constants.O_NOFOLLOW);
  assert.equal(operations[0], "open");
  assert.equal(operations[1], "stat");
  assert.ok(operations.slice(2, -1).every((operation) => operation === "read"));
  assert.equal(operations.at(-1), "close");
});

test("doctor fails closed for symlinked and oversized Aider config", async (context) => {
  const directory = await stateDirectory(context);
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-aider-symlink-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const outside = path.join(home, "outside.yml");
  const configPath = path.join(home, ".aider.conf.yml");
  await writeFile(
    outside,
    "notifications-command: /usr/local/bin/unrelated-alert\n",
  );
  await symlink(outside, configPath);

  const symlinked = await runCli(["doctor", "--home", home, "--json"], {
    stateDirectory: directory,
  });

  assert.equal(symlinked.code, 0, symlinked.stderr);
  const symlinkedIntegration = JSON.parse(symlinked.stdout).capabilities
    .providers.aider.integration;
  assert.equal(symlinkedIntegration.status, "unknown");
  assert.equal(symlinkedIntegration.source, "user-config");

  await rm(configPath);
  await writeFile(configPath, "x".repeat(1_048_577));
  const oversized = await runCli(["doctor", "--home", home, "--json"], {
    stateDirectory: directory,
  });

  assert.equal(oversized.code, 0, oversized.stderr);
  const oversizedIntegration = JSON.parse(oversized.stdout).capabilities
    .providers.aider.integration;
  assert.equal(oversizedIntegration.status, "unknown");
  assert.equal(oversizedIntegration.source, "user-config");
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
      "--terminal-title",
      "--",
      process.execPath,
      "-e",
      "process.stdout.write(JSON.stringify({surface: process.env.SIDE_GLANCE_SURFACE_ID, session: process.env.SIDE_GLANCE_SESSION_ID, terminalTitle: process.env.SIDE_GLANCE_TERMINAL_TITLE}))",
    ],
    { stateDirectory: directory },
  );

  assert.equal(result.code, 0, result.stderr);
  const environment = JSON.parse(result.stdout);
  assert.equal(environment.surface, "test:inherited-surface");
  assert.match(environment.session, /^wrapper-/u);
  assert.equal(environment.terminalTitle, "1");
});

test("doctor warns that Terminal.app background support needs manual verification", async (context) => {
  const directory = await stateDirectory(context);
  const doctor = await runCli(["doctor", "--json"], {
    stateDirectory: directory,
    env: { TERM_PROGRAM: "Apple_Terminal" },
  });

  assert.equal(doctor.code, 0, doctor.stderr);
  const terminal = JSON.parse(doctor.stdout).terminal;
  assert.equal(terminal.emulator, "terminal.app");
  assert.equal(terminal.background.status, "manual-verification-required");
  assert.equal(terminal.titleFallback.optInFlag, "--terminal-title");
  assert.ok(terminal.warnings.some((warning: string) => warning.includes("OSC 11")));
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
    warnings.some((warning) => warning.includes("enabled by default")),
  );
});

test("installs and removes the owned OpenCode notification plugin through the CLI", async (context) => {
  const directory = await stateDirectory(context);
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-cli-opencode-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const executable = path.join(home, "side-glance-bin");
  await writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  const providerBin = path.join(home, "bin");
  await mkdir(providerBin, { recursive: true });
  await writeFile(path.join(providerBin, "opencode"), "#!/bin/sh\nexit 0\n", {
    mode: 0o700,
  });

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
    { stateDirectory: directory, env: { PATH: providerBin } },
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

test("rejects an executable directory masquerading as OpenCode on PATH", async (context) => {
  const directory = await stateDirectory(context);
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-cli-opencode-path-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const executable = path.join(home, "side-glance-bin");
  const providerBin = path.join(home, "bin");
  await mkdir(path.join(providerBin, "opencode"), { recursive: true });
  await writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });

  const result = await runCli(
    [
      "install",
      "opencode",
      "--home",
      home,
      "--executable",
      executable,
      "--json",
    ],
    { stateDirectory: directory, env: { PATH: providerBin } },
  );

  assert.equal(result.code, 1);
  assert.match(result.stderr, /stable v1|regular executable|not found/i);
  await assert.rejects(
    () =>
      readFile(
        path.join(home, ".config", "opencode", "plugins", "side-glance.js"),
        "utf8",
      ),
    /ENOENT/u,
  );
});

test("installs colors-only OpenCode v1 support and rejects v2-only runtimes", async (context) => {
  const directory = await stateDirectory(context);
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-cli-opencode-api-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const executable = path.join(home, "side-glance-bin");
  const providerBin = path.join(home, "bin");
  await mkdir(providerBin, { recursive: true });
  await writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  await writeFile(path.join(providerBin, "opencode"), "#!/bin/sh\nexit 0\n", {
    mode: 0o700,
  });

  const installed = await runCli(
    [
      "install",
      "opencode",
      "--home",
      home,
      "--executable",
      executable,
      "--json",
    ],
    { stateDirectory: directory, env: { PATH: providerBin } },
  );
  assert.equal(installed.code, 0, installed.stderr);
  const pluginPath = JSON.parse(installed.stdout).configPath;
  const plugin = await readFile(pluginPath, "utf8");
  assert.match(plugin, /\["hook","--provider","opencode","--json"\]/u);
  assert.doesNotMatch(plugin, /--notifications/u);

  await rm(pluginPath);
  await rm(path.join(providerBin, "opencode"));
  await writeFile(path.join(providerBin, "opencode2"), "#!/bin/sh\nexit 0\n", {
    mode: 0o700,
  });
  const incompatible = await runCli(
    [
      "install",
      "opencode",
      "--home",
      home,
      "--executable",
      executable,
      "--json",
    ],
    { stateDirectory: directory, env: { PATH: providerBin } },
  );
  assert.equal(incompatible.code, 1);
  assert.match(incompatible.stderr, /OpenCode 2|v2|stable v1/i);
  await assert.rejects(() => readFile(pluginPath), /ENOENT/u);

  await rm(path.join(providerBin, "opencode2"));
  await writeFile(path.join(providerBin, "opencode"), "#!/bin/sh\nexit 0\n", {
    mode: 0o700,
  });
  const overridden = await runCli(
    [
      "install",
      "opencode",
      "--home",
      home,
      "--executable",
      executable,
      "--json",
    ],
    {
      stateDirectory: directory,
      env: {
        PATH: providerBin,
        OPENCODE_CONFIG_DIR: path.join(home, "custom-opencode"),
      },
    },
  );
  assert.equal(overridden.code, 1);
  assert.match(overridden.stderr, /configuration overrides|OPENCODE_CONFIG_DIR/u);
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

test("refuses an explicit npx-cache executable from an otherwise durable install", async (context) => {
  const directory = await stateDirectory(context);
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-explicit-npx-home-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const cacheBin = path.join(home, ".npm", "_npx", "fixture", "node_modules", ".bin");
  const cachedExecutable = path.join(cacheBin, "side-glance");
  await mkdir(cacheBin, { recursive: true });
  await writeFile(
    cachedExecutable,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(cliPath)} "$@"\n`,
    { mode: 0o700 },
  );

  const result = await runCli(
    [
      "install",
      "claude",
      "--home",
      home,
      "--executable",
      cachedExecutable,
      "--json",
    ],
    { stateDirectory: directory },
  );

  assert.equal(result.code, 1);
  assert.match(result.stderr, /temporary|ephemeral|npx|cache|durable/iu);
  await assert.rejects(
    () => readFile(path.join(home, ".claude", "settings.json"), "utf8"),
    /ENOENT/u,
  );
});

test("guided setup help is side-effect free and exposes init plus setup", async (context) => {
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-setup-help-"));
  context.after(() => rm(home, { recursive: true, force: true }));

  for (const command of ["init", "setup"] as const) {
    const result = await runCli([command, "--help"], {
      env: { HOME: home },
    });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /side-glance init/u);
    assert.match(result.stdout, /side-glance setup/u);
    await assert.rejects(
      () => readFile(path.join(home, ".claude", "settings.json"), "utf8"),
      /ENOENT/u,
    );
  }
});

test("guided init refuses an incomplete non-TTY invocation before mutation", async (context) => {
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-setup-nontty-"));
  context.after(() => rm(home, { recursive: true, force: true }));

  const result = await runCli(["init"], { env: { HOME: home } });

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /--dry-run|--yes/iu);
  await assert.rejects(
    () => readFile(path.join(home, ".claude", "settings.json"), "utf8"),
    /ENOENT/u,
  );
});

test("guided setup returns one redacted durable dry-run plan without writing", async (context) => {
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-setup-dry-run-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const executable = path.join(home, "side-glance-bin");
  const providerBin = path.join(home, "bin");
  await mkdir(providerBin, { recursive: true });
  await writeFile(executable, "#!/bin/sh\nprintf 'development\\n'\n", {
    mode: 0o700,
  });
  await writeFile(path.join(providerBin, "claude"), "#!/bin/sh\nexit 0\n", {
    mode: 0o700,
  });

  const result = await runCli(
    [
      "setup",
      "--dry-run",
      "--providers",
      "claude",
      "--notifications",
      "none",
      "--home",
      home,
      "--executable",
      executable,
      "--json",
    ],
    { env: { HOME: home, PATH: providerBin } },
  );

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.kind, "setup-plan");
  assert.deepEqual(plan.providers.map((provider: { id: string }) => provider.id), [
    "claude",
  ]);
  assert.ok(!result.stdout.includes("SIDE_GLANCE_MANAGED_HOOK"));
  await assert.rejects(
    () => readFile(path.join(home, ".claude", "settings.json"), "utf8"),
    /ENOENT/u,
  );
});

test("guided setup JSON failures stay versioned, redacted, and machine-only", async (context) => {
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-setup-json-error-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const sentinel = "DO_NOT_ECHO_CONFIGURATION_SECRET";

  const result = await runCli(
    [
      "setup",
      "--dry-run",
      "--providers",
      `unknown-${sentinel}`,
      "--notifications",
      "none",
      "--json",
    ],
    { env: { HOME: home } },
  );

  assert.equal(result.code, 1);
  assert.equal(result.stderr, "");
  const failure = JSON.parse(result.stdout);
  assert.equal(failure.schemaVersion, 1);
  assert.equal(failure.kind, "setup-error");
  assert.equal(failure.code, "invalid-options");
  assert.ok(!result.stdout.includes(sentinel));
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
  assert.equal(reset.stdout, "{}\n");
  const status = await runCli(["status", "--json"], {
    stateDirectory: directory,
  });
  const sessions = JSON.parse(status.stdout).sessions;
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
  assert.equal(reset.stdout, "{}\n");
  const status = await runCli(["status", "--json"], {
    stateDirectory: directory,
  });
  const state = JSON.parse(status.stdout);
  assert.ok(Object.values(state.sessions).every(
    (session) => (session as { phase: string }).phase === "inactive",
  ));
  assert.ok(Object.values(state.surfaces).every(
    (surface) => (surface as { phase: string }).phase === "inactive",
  ));
});
