import assert from "node:assert/strict";
import test from "node:test";

import {
  runSetupCommand,
  type SetupDiscovery,
} from "../../src/cli/setup-command.ts";
import type { SetupPrompter, PromptOutcome } from "../../src/cli/prompts.ts";
import type {
  SetupPlan,
  SetupPlanDependencies,
  SetupRequest,
} from "../../src/cli/setup.ts";
import { SetupTransactionError } from "../../src/cli/setup-transaction.ts";

const executablePath = "/opt/homebrew/bin/side-glance";
const homeDirectory = "/Users/example";

test("setup help returns before discovery", async () => {
  let discoveries = 0;
  let stdout = "";
  const code = await runSetupCommand("init", ["--help"], {
    execution: "durable",
    interactive: false,
    discover: async () => {
      discoveries += 1;
      return discovery();
    },
    writeStdout: (value) => {
      stdout += value;
    },
    writeStderr: () => assert.fail("help must not write stderr"),
  });

  assert.equal(code, 0);
  assert.equal(discoveries, 0);
  assert.match(stdout, /side-glance init/u);
  assert.match(stdout, /side-glance setup/u);
});

test("durable JSON dry-run emits one selected-provider redacted plan", async () => {
  let stdout = "";
  let stderr = "";
  const code = await runSetupCommand(
    "setup",
    [
      "--dry-run",
      "--providers",
      "claude",
      "--notifications",
      "none",
      "--json",
    ],
    {
      execution: "durable",
      interactive: false,
      discover: async () => discovery(),
      writeStdout: (value) => {
        stdout += value;
      },
      writeStderr: (value) => {
        stderr += value;
      },
    },
  );

  assert.equal(code, 0);
  assert.equal(stderr, "");
  assert.equal(stdout.endsWith("\n"), true);
  assert.equal(stdout.trim().split("\n").length, 1);
  const plan = JSON.parse(stdout);
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.kind, "setup-plan");
  assert.deepEqual(plan.providers.map(({ id }: { id: string }) => id), [
    "claude",
  ]);
  assert.equal(plan.providers[0].notifications.coverage.ready, "pre-final-silent");
  assert.equal(stdout.includes("PRIVATE_RAW_CONFIGURATION"), false);
});

test("JSON option failures are machine-only and do not echo hostile input", async () => {
  let stdout = "";
  let stderr = "";
  const sentinel = "PRIVATE_RAW_CONFIGURATION";
  const code = await runSetupCommand(
    "setup",
    [
      "--dry-run",
      "--providers",
      `unknown-${sentinel}`,
      "--notifications",
      "none",
      "--json",
    ],
    {
      execution: "durable",
      interactive: false,
      discover: async () => assert.fail("invalid args must not discover"),
      writeStdout: (value) => {
        stdout += value;
      },
      writeStderr: (value) => {
        stderr += value;
      },
    },
  );

  assert.equal(code, 1);
  assert.equal(stderr, "");
  assert.deepEqual(JSON.parse(stdout), {
    schemaVersion: 1,
    kind: "setup-error",
    code: "invalid-options",
  });
  assert.equal(stdout.includes(sentinel), false);
});

test("interactive setup previews the final choices and applies only after confirmation", async () => {
  const requests: SetupRequest[] = [];
  const applied: SetupPlan[] = [];
  let stdout = "";
  const prompter = scriptedPrompter([
    { status: "value", value: ["codex", "claude"] },
    { status: "value", value: ["claude"] },
    { status: "value", value: "Ping" },
    { status: "value", value: true },
  ]);

  const code = await runSetupCommand("init", [], {
    execution: "durable",
    interactive: true,
    discover: async (request) => {
      requests.push(request);
      return discovery(async (plan) => {
        applied.push(plan);
        return {
          providers: plan.selectedProviders.map((id) => ({
            id,
            configPath: `${homeDirectory}/.${id}/settings.json`,
            changed: true,
          })),
        };
      });
    },
    prompter,
    writeStdout: (value) => {
      stdout += value;
    },
    writeStderr: () => assert.fail("happy path must not write stderr"),
  });

  assert.equal(code, 0);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1]?.providers, ["claude", "codex"]);
  assert.deepEqual(requests[1]?.notifications, ["claude"]);
  assert.equal(requests[1]?.notificationsSpecified, true);
  assert.equal(requests[1]?.notificationSound, "Ping");
  assert.equal(applied.length, 1);
  assert.deepEqual(applied[0]?.selectedProviders, ["claude", "codex"]);
  assert.match(prompter.rendered.join("\n"), /Claude.*create/u);
  assert.match(stdout, /Setup complete/u);
  assert.equal(prompter.closed, true);
});

test("human dry-run and apply render the complete truthful setup plan and result", async () => {
  let dryRunOutput = "";
  const dryRunCode = await runSetupCommand(
    "setup",
    ["--dry-run", "--providers", "claude", "--notifications", "none"],
    {
      execution: "durable",
      interactive: false,
      discover: async () => discovery(),
      writeStdout: (value) => {
        dryRunOutput += value;
      },
      writeStderr: () => assert.fail("dry-run must not write stderr"),
    },
  );

  assert.equal(dryRunCode, 0);
  assert.match(dryRunOutput, new RegExp(escapeRegExp(executablePath), "u"));
  assert.match(
    dryRunOutput,
    new RegExp(escapeRegExp(`${homeDirectory}/.claude/settings.json`), "u"),
  );
  assert.match(dryRunOutput, /contract-audited/u);
  assert.match(dryRunOutput, /managed hooks: 1/u);
  assert.match(dryRunOutput, /pre-final Ready stays silent/u);
  assert.match(dryRunOutput, /side-glance run --label "Claude" -- claude/u);
  assert.match(dryRunOutput, /side-glance run --notify-on-exit -- <command>/u);
  assert.match(dryRunOutput, /stable terminal surface identity/u);
  assert.match(dryRunOutput, /caught apply or verification failure.*rolls back/u);
  assert.match(dryRunOutput, /SIGKILL.*next side-glance init or side-glance doctor/u);

  let applyOutput = "";
  const applyCode = await runSetupCommand(
    "setup",
    ["--yes", "--providers", "claude", "--notifications", "none"],
    {
      execution: "durable",
      interactive: false,
      discover: async () =>
        discovery(async () => ({
          providers: [
            {
              id: "claude",
              configPath: `${homeDirectory}/.claude/settings.json`,
              changed: true,
              backupPath: `${homeDirectory}/.claude/settings.json.side-glance-backup-1`,
            },
          ],
        })),
      writeStdout: (value) => {
        applyOutput += value;
      },
      writeStderr: () => assert.fail("apply must not write stderr"),
    },
  );

  assert.equal(applyCode, 0);
  assert.match(applyOutput, /Claude: changed; integration installed and verified/u);
  assert.match(applyOutput, /settings\.json\.side-glance-backup-1/u);
  assert.match(applyOutput, /side-glance run --label "Claude" -- claude/u);
});

test("explicit interactive selections remain fixed and an unsafe sound reprompts", async () => {
  const requests: SetupRequest[] = [];
  const prompter = scriptedPrompter([
    { status: "value", value: "Bad/Sound" },
    { status: "value", value: "Ping" },
    { status: "value", value: true },
  ]);

  const code = await runSetupCommand(
    "init",
    ["--providers", "claude", "--notifications", "claude"],
    {
      execution: "durable",
      interactive: true,
      discover: async (request) => {
        requests.push(request);
        return discovery();
      },
      prompter,
      writeStdout: () => undefined,
      writeStderr: () => assert.fail("valid interactive retry must not fail"),
    },
  );

  assert.equal(code, 0);
  assert.equal(prompter.calls.filter(({ kind }) => kind === "multiselect").length, 0);
  assert.equal(prompter.calls.filter(({ kind }) => kind === "text").length, 2);
  assert.match(prompter.rendered.join("\n"), /safe installed sound name/u);
  assert.deepEqual(requests.at(-1)?.providers, ["claude"]);
  assert.deepEqual(requests.at(-1)?.notifications, ["claude"]);
  assert.equal(requests.at(-1)?.notificationSound, "Ping");
});

test("interactive notification choices explain defaults and provider coverage plainly", async () => {
  const prompter = scriptedPrompter([
    { status: "value", value: ["claude", "codex"] },
    { status: "value", value: [] },
    { status: "value", value: false },
  ]);

  const code = await runSetupCommand("init", [], {
    execution: "durable",
    interactive: true,
    discover: async () => discovery(),
    prompter,
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  });

  assert.equal(code, 0);
  const notificationCall = prompter.calls.find(
    ({ message }) => message === "Select Side Glance computer notifications",
  );
  assert.ok(notificationCall?.choices);
  const labels = notificationCall.choices.map(({ label }) => label).join("\n");
  assert.equal(
    notificationCall.choices.every(({ label }) => [...label].length <= 160),
    true,
  );
  assert.match(labels, /Claude.*Ready stays silent before final/u);
  assert.match(labels, /Codex.*native ready.*defaults off.*duplicate/u);
  assert.doesNotMatch(labels, /pre-final-silent/u);
});

test("no eligible providers exits read-only with usable guidance", async () => {
  const prompter = scriptedPrompter([]);
  const code = await runSetupCommand("init", [], {
    execution: "durable",
    interactive: true,
    discover: async () => ({
      ...discovery(),
      dependencies: {
        ...setupDependencies(),
        providers: setupDependencies().providers.map((provider) => ({
          provider: provider.provider,
          state: "unavailable" as const,
          integrationStatus: "not-installed" as const,
          reason: "binary-not-found" as const,
          nativeNotifications: provider.nativeNotifications,
        })),
      },
    }),
    prompter,
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  });

  assert.equal(code, 0);
  assert.match(prompter.rendered.join("\n"), /Claude: unavailable/u);
  assert.match(prompter.rendered.join("\n"), /provider command was not found/u);
  assert.match(
    prompter.rendered.join("\n"),
    /AIDER_NOTIFICATIONS_COMMAND=.*side-glance run --label "Aider" -- aider/u,
  );
  assert.match(
    prompter.rendered.join("\n"),
    /side-glance run --notify-on-exit -- <command>/u,
  );
  assert.equal(prompter.calls.length, 0);
});

test("an abort during discovery exits 130 before any prompt or apply", async () => {
  const controller = new AbortController();
  const prompter = scriptedPrompter([]);
  let applies = 0;
  let stderr = "";

  const code = await runSetupCommand("init", [], {
    execution: "durable",
    interactive: true,
    discover: async () => {
      controller.abort();
      return discovery(async () => {
        applies += 1;
        return { providers: [] };
      });
    },
    prompter,
    signal: controller.signal,
    writeStdout: () => undefined,
    writeStderr: (value) => {
      stderr += value;
    },
  });

  assert.equal(code, 130);
  assert.equal(applies, 0);
  assert.equal(prompter.calls.length, 0);
  assert.match(stderr, /interrupted/u);
});

test("interactive No and EOF are successful no-write cancellations while SIGINT is 130", async () => {
  for (const fixture of [
    {
      final: { status: "value", value: false } as PromptOutcome<unknown>,
      expected: 0,
    },
    {
      final: { status: "cancelled", reason: "eof" } as PromptOutcome<unknown>,
      expected: 0,
    },
    {
      final: { status: "cancelled", reason: "signal" } as PromptOutcome<unknown>,
      expected: 130,
    },
  ]) {
    let applies = 0;
    const prompter = scriptedPrompter([
      { status: "value", value: ["claude"] },
      { status: "value", value: [] },
      fixture.final,
    ]);
    const code = await runSetupCommand("setup", [], {
      execution: "durable",
      interactive: true,
      discover: async () =>
        discovery(async () => {
          applies += 1;
          return { providers: [] };
        }),
      prompter,
      writeStdout: () => undefined,
      writeStderr: () => undefined,
    });
    assert.equal(code, fixture.expected);
    assert.equal(applies, 0);
  }
});

test("a caught apply interruption returns 130 with a versioned JSON failure", async () => {
  let stdout = "";
  const code = await runSetupCommand(
    "setup",
    [
      "--providers",
      "claude",
      "--notifications",
      "none",
      "--yes",
      "--json",
    ],
    {
      execution: "durable",
      interactive: false,
      discover: async () =>
        discovery(async () => {
          throw new SetupTransactionError("interrupted");
        }),
      writeStdout: (value) => {
        stdout += value;
      },
      writeStderr: () => assert.fail("JSON interruption must not write stderr"),
    },
  );

  assert.equal(code, 130);
  assert.deepEqual(JSON.parse(stdout), {
    schemaVersion: 1,
    kind: "setup-error",
    code: "interrupted",
  });
});

function discovery(
  apply: SetupDiscovery["apply"] = async () => ({ providers: [] }),
): SetupDiscovery {
  return {
    dependencies: setupDependencies(),
    apply,
  };
}

function setupDependencies(): SetupPlanDependencies {
  return {
    homeDirectory,
    executablePath,
    notificationBackend: { status: "available", backend: "osascript" },
    providers: [
      observation("claude", "not-configured", "create"),
      observation("codex", "ready", "update"),
      observation("gemini", "unknown", "unchanged"),
      {
        provider: "opencode",
        state: "unavailable",
        integrationStatus: "not-installed",
        reason: "binary-not-found",
        nativeNotifications: { status: "not-configured" },
      },
    ],
    guidance: [
      {
        kind: "aider",
        available: true,
        command:
          "AIDER_NOTIFICATIONS_COMMAND='side-glance notify --source aider --kind completed --json' side-glance run --label \"Aider\" -- aider",
      },
      {
        kind: "generic",
        available: true,
        command: "side-glance run --notify-on-exit -- <command>",
      },
    ],
  };
}

function observation(
  provider: "claude" | "codex" | "gemini",
  nativeStatus: "ready" | "not-configured" | "unknown",
  action: "create" | "update" | "unchanged",
) {
  return {
    provider,
    state: "eligible" as const,
    integrationStatus: "not-installed" as const,
    target: {
      path: `${homeDirectory}/.${provider}/settings.json`,
      action,
      managedHookCount: 1,
    },
    nativeNotifications: { status: nativeStatus },
  };
}

function scriptedPrompter(outcomes: PromptOutcome<unknown>[]) {
  const rendered: string[] = [];
  const calls: Array<{
    kind: "multiselect" | "confirm" | "text";
    message: string;
    choices?: readonly { id: string; label: string }[];
  }> = [];
  const next = <Value>(): Promise<PromptOutcome<Value>> => {
    const outcome = outcomes.shift();
    if (!outcome) throw new Error("missing scripted prompt outcome");
    return Promise.resolve(outcome as PromptOutcome<Value>);
  };
  const prompter: SetupPrompter & {
    rendered: string[];
    calls: typeof calls;
    closed: boolean;
  } = {
    rendered,
    calls,
    closed: false,
    multiselect: async (message, choices) => {
      calls.push({ kind: "multiselect", message, choices });
      return next<string[]>();
    },
    confirm: async (message) => {
      calls.push({ kind: "confirm", message });
      return next<boolean>();
    },
    text: async (message) => {
      calls.push({ kind: "text", message });
      return next<string>();
    },
    note: (message) => rendered.push(message),
    detail: (message) => rendered.push(message),
    close() {
      this.closed = true;
    },
  };
  return prompter;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
