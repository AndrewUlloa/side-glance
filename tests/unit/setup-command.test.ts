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
  assert.match(stdout, /Customize includes providers, notifications.*colors/u);
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

test("interactive init offers recommended settings first and applies planner defaults", async () => {
  const requests: SetupRequest[] = [];
  const applied: SetupPlan[] = [];
  let stdout = "";
  const prompter = scriptedPrompter([
    { status: "value", value: "recommended" },
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
            ...(id === "claude"
              ? {
                  backupPath: `${homeDirectory}/.claude/settings.json.side-glance-backup-1`,
                }
              : {}),
          })),
        };
      });
    },
    prompter,
    writeStdout: (value) => {
      stdout += value;
    },
    writeStderr: () => assert.fail("recommended setup must not fail"),
  });

  assert.equal(code, 0);
  assert.deepEqual(
    prompter.calls.map(({ kind }) => kind),
    ["select", "confirm", "progress-start", "progress-stop"],
  );
  assert.deepEqual(requests[1]?.providers, ["claude", "codex", "gemini"]);
  assert.deepEqual(requests[1]?.notifications, ["claude"]);
  assert.equal(requests[1]?.notificationSound, "Glass");
  assert.deepEqual(applied[0]?.selectedProviders, ["claude", "codex", "gemini"]);
  const firstDecision = prompter.calls[0];
  assert.equal(firstDecision?.kind, "select");
  assert.equal(firstDecision?.choices?.[0]?.id, "recommended");
  assert.equal(
    firstDecision?.choices?.[0]?.label,
    "Recommended — Claude, Codex, and Gemini · notifications for Claude",
  );
  const beforeFirstDecision = prompter.rendered.slice(0, 5).join("\n");
  assert.doesNotMatch(beforeFirstDecision, /contract-audited|integration unknown/u);
  const rendered = prompter.rendered.join("\n");
  assert.match(rendered, /Claude CLI found/u);
  assert.match(rendered, /Codex CLI found/u);
  assert.match(rendered, /Gemini CLI found/u);
  assert.match(rendered, /OpenCode skipped[\s\S]*Terminal's PATH/u);
  assert.doesNotMatch(rendered, /providers? (?:is|are) unavailable/u);
  assert.doesNotMatch(rendered, /contract-audited|pre-final-silent/u);
  assert.match(rendered, /Review/u);
  assert.match(rendered, /Providers: Claude, Codex, and Gemini/u);
  assert.match(rendered, /Computer notifications: Claude · Glass/u);
  assert.match(
    rendered,
    /Colors: Status.*Working cyan.*Ready green.*Waiting amber.*Failed red/u,
  );
  assert.match(rendered, /Configuration:/u);
  assert.match(rendered, /Claude: ~\/\.claude\/settings\.json/u);
  assert.doesNotMatch(rendered, /attention.*failure|launch:/u);
  assert.doesNotMatch(rendered, /write this configuration|roll back/iu);
  assert.match(prompter.rendered.join("\n"), /warning.*duplicate alerts/iu);
  assert.equal(
    rendered
      .split("\n")
      .filter((line) => line.includes("Warning:"))
      .every((line) => [...line].length <= 80),
    true,
  );
  assert.equal(prompter.calls.at(-1)?.success, true);
  assert.equal(prompter.calls.at(-1)?.message, "Configuration saved.");
  assert.match(stdout, /Side Glance is ready/u);
  assert.match(stdout, /Claude configured/u);
  assert.match(stdout, /Computer notifications enabled · Glass/u);
  assert.match(stdout, /delivery not tested/iu);
  assert.match(stdout, /Change anytime: side-glance theme/u);
  assert.match(stdout, /Next\s+claude/u);
  assert.doesNotMatch(stdout, /Next\s+side-glance run/u);
  assert.match(
    stdout,
    /Backup saved to:\s+~\/\.claude\/settings\.json\.side-glance-backup-1/u,
  );
  assert.doesNotMatch(stdout, new RegExp(homeDirectory, "u"));
  assert.equal(stdout.match(/Side Glance is ready/gu)?.length, 1);
  assert.doesNotMatch(stdout, /Setup complete|Durable executable/u);
  assert.doesNotMatch(stdout, /attention.*failure|Manual and wrapper guidance/iu);
});

test("interactive init explicitly replaces or skips a legacy Claude Stoplight painter", async () => {
  for (const decision of ["replace", "skip"] as const) {
    const requests: SetupRequest[] = [];
    const applied: SetupPlan[] = [];
    let stdout = "";
    const prompter = scriptedPrompter([
      { status: "value", value: "recommended" },
      { status: "value", value: decision },
      { status: "value", value: true },
    ]);
    const dependencies = setupDependencies();
    dependencies.providers = dependencies.providers.map((provider) =>
      provider.provider === "claude"
        ? { ...provider, legacyStoplightHooks: 5 }
        : provider,
    );

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
        }, dependencies);
      },
      prompter,
      writeStdout: (value) => {
        stdout += value;
      },
      writeStderr: () => assert.fail("legacy migration decision must not fail"),
    });

    assert.equal(code, 0);
    const conflictPrompt = prompter.calls.find(
      ({ message }) => message === "Claude already has legacy Stoplight colors. What should Side Glance do?",
    );
    assert.deepEqual(
      conflictPrompt?.choices?.map(({ id }) => id),
      ["replace", "skip"],
    );
    assert.match(prompter.rendered.join("\n"), /two color hooks can compete/iu);
    if (decision === "replace") {
      assert.equal(requests[1]?.migrateLegacyStoplight, true);
      assert.deepEqual(applied[0]?.selectedProviders, ["claude", "codex", "gemini"]);
      assert.match(
        prompter.rendered.join("\n"),
        /legacy Stoplight colors[\s\S]*long-turn bell[\s\S]*disabled/iu,
      );
      assert.match(stdout, /Legacy Stoplight disabled/u);
    } else {
      assert.equal(requests[1]?.migrateLegacyStoplight, false);
      assert.deepEqual(applied[0]?.selectedProviders, ["codex", "gemini"]);
      assert.doesNotMatch(stdout, /Claude configured/u);
      assert.match(prompter.rendered.join("\n"), /Keeping legacy Stoplight; Claude will be skipped/u);
    }
  }
});

test("automated setup reports the exact legacy migration action before apply", async () => {
  const dependencies = setupDependencies();
  dependencies.providers = dependencies.providers.map((provider) =>
    provider.provider === "claude"
      ? { ...provider, legacyStoplightHooks: 5 }
      : provider,
  );
  let stderr = "";
  const applyCode = await runSetupCommand(
    "setup",
    ["--providers", "claude", "--notifications", "none", "--yes"],
    {
      execution: "durable",
      interactive: false,
      discover: async () => discovery(undefined, dependencies),
      writeStdout: () => undefined,
      writeStderr: (value) => {
        stderr += value;
      },
    },
  );
  assert.equal(applyCode, 1);
  assert.match(stderr, /--migrate-legacy-stoplight/u);
  assert.match(stderr, /omit Claude from --providers/u);

  let dryRun = "";
  const dryRunCode = await runSetupCommand(
    "setup",
    [
      "--dry-run",
      "--providers",
      "claude",
      "--notifications",
      "none",
    ],
    {
      execution: "durable",
      interactive: false,
      discover: async () => discovery(undefined, dependencies),
      writeStdout: (value) => {
        dryRun += value;
      },
      writeStderr: () => assert.fail("dry-run must remain readable"),
    },
  );
  assert.equal(dryRunCode, 0);
  assert.match(dryRun, /legacy Stoplight: conflict active/iu);
  assert.match(dryRun, /--migrate-legacy-stoplight/u);
});

test("interactive setup reports an existing Heat theme as unchanged", async () => {
  let stdout = "";
  const prompter = scriptedPrompter([
    { status: "value", value: "recommended" },
    { status: "value", value: true },
  ]);

  const code = await runSetupCommand("init", [], {
    execution: "durable",
    interactive: true,
    appearance: {
      configPath: "/Users/example/.config/side-glance/config.json",
      exists: true,
      valid: true,
      config: {
        schemaVersion: 1,
        appearance: { preset: "heat", ceiling: { mode: "adaptive" } },
      },
    },
    discover: async () => discovery(),
    saveAppearance: async () =>
      assert.fail("Recommended must preserve the existing saved theme"),
    prompter,
    writeStdout: (value) => {
      stdout += value;
    },
    writeStderr: () => assert.fail("setup must not fail"),
  });

  assert.equal(code, 0);
  assert.match(prompter.rendered.join("\n"), /Colors: Heat \(unchanged\)/u);
  assert.match(stdout, /Colors: Heat \(unchanged\)/u);
  assert.doesNotMatch(stdout, /Colors: Status/u);
  assert.equal(
    prompter.calls.some(
      ({ message }) => message === "What should colors communicate?",
    ),
    false,
  );
});

test("interactive progress starts after approval and never reports success on failure", async () => {
  let stdout = "";
  const prompter = scriptedPrompter([
    { status: "value", value: "recommended" },
    { status: "value", value: true },
  ]);

  const code = await runSetupCommand("init", [], {
    execution: "durable",
    interactive: true,
    discover: async () =>
      discovery(async () => {
        throw new SetupTransactionError("apply-failed");
      }),
    prompter,
    writeStdout: (value) => {
      stdout += value;
    },
    writeStderr: () => undefined,
  });

  assert.equal(code, 1);
  assert.deepEqual(
    prompter.calls.map(({ kind }) => kind),
    ["select", "confirm", "progress-start", "progress-stop"],
  );
  assert.equal(prompter.calls.at(-1)?.success, false);
  assert.match(
    prompter.calls.at(-1)?.message ?? "",
    /could not be verified/iu,
  );
  assert.doesNotMatch(prompter.calls.at(-1)?.message ?? "", /not applied/iu);
  assert.doesNotMatch(stdout, /Setup complete|verified/iu);
});

test("rollback conflicts and failures never claim configuration was not applied", async () => {
  for (const errorCode of ["rollback-conflict", "rollback-failed"] as const) {
    const prompter = scriptedPrompter([
      { status: "value", value: "recommended" },
      { status: "value", value: true },
    ]);
    const code = await runSetupCommand("init", [], {
      execution: "durable",
      interactive: true,
      discover: async () =>
        discovery(async () => {
          throw new SetupTransactionError(errorCode);
        }),
      prompter,
      writeStdout: () => undefined,
      writeStderr: () => undefined,
    });

    assert.equal(code, 1);
    assert.equal(prompter.calls.at(-1)?.success, false);
    assert.match(
      prompter.calls.at(-1)?.message ?? "",
      /could not be verified/iu,
    );
    assert.doesNotMatch(prompter.calls.at(-1)?.message ?? "", /not applied/iu);
  }
});

test("an abort after approval always settles progress as unsuccessful", async () => {
  const controller = new AbortController();
  const prompter = scriptedPrompter([
    { status: "value", value: "recommended" },
    { status: "value", value: true },
  ]);
  const startProgress = prompter.startProgress;
  prompter.startProgress = (message) => {
    startProgress?.(message);
    controller.abort();
  };

  const code = await runSetupCommand("init", [], {
    execution: "durable",
    interactive: true,
    discover: async () => discovery(),
    prompter,
    signal: controller.signal,
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  });

  assert.equal(code, 130);
  assert.deepEqual(
    prompter.calls.slice(-2).map(({ kind }) => kind),
    ["progress-start", "progress-stop"],
  );
  assert.equal(prompter.calls.at(-1)?.success, false);
});

test("an abort after provider apply never persists customized colors", async () => {
  const controller = new AbortController();
  const prompter = scriptedPrompter([
    { status: "value", value: "customize" },
    { status: "value", value: ["claude"] },
    { status: "value", value: [] },
    { status: "value", value: "status" },
    { status: "value", value: true },
  ]);

  const code = await runSetupCommand("init", [], {
    execution: "durable",
    interactive: true,
    discover: async () =>
      discovery(async () => {
        controller.abort();
        return { providers: [] };
      }),
    prompter,
    saveAppearance: async () =>
      assert.fail("interrupted setup must not save colors"),
    signal: controller.signal,
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  });

  assert.equal(code, 130);
  assert.equal(prompter.calls.at(-1)?.kind, "progress-stop");
  assert.equal(prompter.calls.at(-1)?.success, false);
});

test("interactive init can exit from the first decision without applying", async () => {
  let discoveries = 0;
  let applies = 0;
  const prompter = scriptedPrompter([
    { status: "value", value: "exit" },
  ]);

  const code = await runSetupCommand("init", [], {
    execution: "durable",
    interactive: true,
    discover: async () => {
      discoveries += 1;
      return discovery(async () => {
        applies += 1;
        return { providers: [] };
      });
    },
    prompter,
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  });

  assert.equal(code, 0);
  assert.equal(discoveries, 1);
  assert.equal(applies, 0);
  assert.match(prompter.rendered.join("\n"), /nothing was changed/iu);
});

test("interactive setup previews the final choices and applies only after confirmation", async () => {
  const requests: SetupRequest[] = [];
  const applied: SetupPlan[] = [];
  let stdout = "";
  const prompter = scriptedPrompter([
    { status: "value", value: "customize" },
    { status: "value", value: ["codex", "claude"] },
    { status: "value", value: ["claude"] },
    { status: "value", value: "Ping" },
    { status: "value", value: "status" },
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
  assert.match(prompter.rendered.join("\n"), /Providers: Claude and Codex/u);
  assert.match(
    prompter.rendered.join("\n"),
    /Claude: ~\/\.claude\/settings\.json/u,
  );
  assert.match(stdout, /Side Glance is ready/u);
  assert.equal(prompter.closed, true);
});

test("customized init includes color behavior in its review and completion", async () => {
  let stdout = "";
  const applyOrder: string[] = [];
  let savedAppearance: unknown;
  const prompter = scriptedPrompter([
    { status: "value", value: "customize" },
    { status: "value", value: ["claude"] },
    { status: "value", value: [] },
    { status: "value", value: "heat" },
    { status: "value", value: "adaptive" },
    { status: "value", value: true },
  ]);

  const code = await runSetupCommand("init", [], {
    execution: "durable",
    interactive: true,
    discover: async () =>
      discovery(async () => {
        applyOrder.push("providers");
        return { providers: [] };
      }),
    saveAppearance: async (appearance) => {
      applyOrder.push("colors");
      savedAppearance = appearance;
      return { changed: true };
    },
    prompter,
    writeStdout: (value) => {
      stdout += value;
    },
    writeStderr: () => assert.fail("customized setup must not fail"),
  });

  assert.equal(code, 0);
  const themeCall = prompter.calls.find(
    ({ message }) => message === "What should colors communicate?",
  );
  assert.ok(themeCall);
  assert.match(
    themeCall.choices?.map(({ label }) => label).join("\n") ?? "",
    /Status[\s\S]*Heat[\s\S]*Custom/u,
  );
  assert.match(
    prompter.rendered.join("\n"),
    /Colors: Heat[\s\S]*Completion ceiling: Adaptive/u,
  );
  assert.match(stdout, /Colors: Heat · Adaptive/u);
  assert.match(stdout, /Change anytime: side-glance theme/u);
  assert.deepEqual(applyOrder, ["providers", "colors"]);
  assert.deepEqual(savedAppearance, {
    preset: "heat",
    ceiling: { mode: "adaptive" },
  });
});

test("customized init reports a truthful partial failure when colors cannot save", async () => {
  let stderr = "";
  const prompter = scriptedPrompter([
    { status: "value", value: "customize" },
    { status: "value", value: ["claude"] },
    { status: "value", value: [] },
    { status: "value", value: "status" },
    { status: "value", value: true },
  ]);

  const code = await runSetupCommand("init", [], {
    execution: "durable",
    interactive: true,
    discover: async () => discovery(),
    saveAppearance: async () => {
      throw new Error("private persistence detail");
    },
    prompter,
    writeStdout: () => assert.fail("partial failure must not claim readiness"),
    writeStderr: (value) => {
      stderr += value;
    },
  });

  assert.equal(code, 1);
  assert.match(stderr, /Provider configuration was verified/u);
  assert.match(stderr, /colors could not be saved/u);
  assert.match(stderr, /side-glance doctor --json.*side-glance theme/u);
  assert.doesNotMatch(stderr, /private persistence detail/u);
  assert.equal(prompter.calls.at(-1)?.kind, "progress-stop");
  assert.equal(prompter.calls.at(-1)?.success, false);
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
  assert.match(dryRunOutput, /launch: claude/u);
  assert.match(dryRunOutput, /side-glance run --notify-on-exit -- <command>/u);
  assert.match(dryRunOutput, /safe terminal discovery/u);
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
  assert.match(applyOutput, /launch: claude/u);
});

test("explicit interactive selections remain fixed and an unsafe sound reprompts", async () => {
  const requests: SetupRequest[] = [];
  const prompter = scriptedPrompter([
    { status: "value", value: "Bad/Sound" },
    { status: "value", value: "Ping" },
    { status: "value", value: "status" },
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
    { status: "value", value: "customize" },
    { status: "value", value: ["claude", "codex"] },
    { status: "value", value: [] },
    { status: "value", value: "status" },
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
  const providerCall = prompter.calls.find(
    ({ message }) => message === "Select provider integrations",
  );
  assert.doesNotMatch(
    providerCall?.choices?.map(({ label }) => label).join("\n") ?? "",
    /eligible|contract-audited|integration not-installed/u,
  );
  assert.ok(notificationCall?.choices);
  const labels = notificationCall.choices.map(({ label }) => label).join("\n");
  assert.equal(
    notificationCall.choices.every(({ label }) => [...label].length <= 74),
    true,
  );
  assert.match(
    labels,
    /Claude.*on.*attention\/failure.*Ready stays silent/u,
  );
  assert.match(
    labels,
    /Codex.*off.*native attention alerts.*Ready stays silent.*duplicates/u,
  );
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
  assert.match(
    prompter.rendered.join("\n"),
    /Claude, Codex, Gemini, and OpenCode skipped[\s\S]*Terminal's PATH/u,
  );
  assert.match(
    prompter.rendered.join("\n"),
    /No provider CLI commands were found/u,
  );
  assert.doesNotMatch(prompter.rendered.join("\n"), /unavailable/u);
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

test("a blocked provider is not described as a missing CLI command", async () => {
  const dependencies = setupDependencies();
  const prompter = scriptedPrompter([]);
  const code = await runSetupCommand("init", [], {
    execution: "durable",
    interactive: true,
    discover: async () => ({
      ...discovery(),
      dependencies: {
        ...dependencies,
        providers: dependencies.providers.map((provider) =>
          provider.provider === "claude"
            ? {
                provider: provider.provider,
                state: "blocked" as const,
                integrationStatus: provider.integrationStatus,
                reason: "unsafe-config-target" as const,
                nativeNotifications: provider.nativeNotifications,
              }
            : {
                provider: provider.provider,
                state: "unavailable" as const,
                integrationStatus: provider.integrationStatus,
                reason: "binary-not-found" as const,
                nativeNotifications: provider.nativeNotifications,
              },
        ),
      },
    }),
    prompter,
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  });

  const rendered = prompter.rendered.join("\n");
  assert.equal(code, 0);
  assert.match(rendered, /Claude skipped.*safety checks/iu);
  assert.match(rendered, /No provider integrations can be configured safely/iu);
  assert.doesNotMatch(rendered, /No provider CLI commands were found/u);
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
      { status: "value", value: "customize" },
      { status: "value", value: ["claude"] },
      { status: "value", value: [] },
      { status: "value", value: "status" },
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
      saveAppearance: async () =>
        assert.fail("cancelled setup must not save colors"),
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
  dependencies: SetupPlanDependencies = setupDependencies(),
): SetupDiscovery {
  return {
    dependencies,
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
    kind:
      | "select"
      | "multiselect"
      | "confirm"
      | "text"
      | "progress-start"
      | "progress-stop";
    message: string;
    choices?: readonly { id: string; label: string }[];
    success?: boolean;
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
    select: async (message, choices) => {
      calls.push({ kind: "select", message, choices });
      return next<string>();
    },
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
    startProgress: (message) => {
      calls.push({ kind: "progress-start", message });
    },
    stopProgress: (message, success) => {
      calls.push({ kind: "progress-stop", message, success });
    },
    close() {
      this.closed = true;
    },
  };
  return prompter;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
