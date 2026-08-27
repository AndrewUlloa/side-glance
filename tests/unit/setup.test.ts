import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  createSetupPlan,
  parseSetupArguments,
  type SetupProviderObservation,
} from "../../src/cli/setup.ts";

test("setup automation arguments normalize providers into canonical order", () => {
  const request = parseSetupArguments(
    [
      "--providers",
      "opencode,claude,gemini,codex",
      "--notifications",
      "gemini,claude",
      "--notification-sound",
      "Glass",
      "--yes",
      "--json",
      "--home",
      path.resolve("/tmp/side-glance-home"),
      "--executable",
      path.resolve("/usr/local/bin/side-glance"),
    ],
    { command: "setup", execution: "durable", interactive: false },
  );

  assert.deepEqual(request, {
    providers: ["claude", "codex", "gemini", "opencode"],
    notifications: ["claude", "gemini"],
    notificationsSpecified: true,
    notificationSound: "Glass",
    dryRun: false,
    yes: true,
    json: true,
    homeDirectory: path.resolve("/tmp/side-glance-home"),
    executablePath: path.resolve("/usr/local/bin/side-glance"),
  });
});

test("setup planner selects only eligible defaults and projects honest notification coverage", () => {
  const observations: SetupProviderObservation[] = [
    providerObservation("opencode", "unavailable", "not-configured"),
    providerObservation("gemini", "blocked", "unknown"),
    {
      ...providerObservation("codex", "eligible", "ready", "update"),
      nativeNotifications: {
        status: "ready",
        warningCodes: ["codex-effective-default", "codex-custom-notify"],
      },
    },
    providerObservation("claude", "eligible", "not-configured", "create"),
  ];

  const plan = createSetupPlan(
    {
      notificationsSpecified: false,
      dryRun: true,
      yes: false,
      json: true,
    },
    {
      homeDirectory: "/Users/example",
      executablePath: "/opt/homebrew/bin/side-glance",
      notificationBackend: { status: "available", backend: "osascript" },
      providers: observations,
      guidance: [
        {
          kind: "aider",
          available: true,
          command:
            "AIDER_NOTIFICATIONS_COMMAND='side-glance notify --source aider --kind turn.completed'",
        },
        {
          kind: "generic",
          available: false,
          command: "side-glance run -- <command>",
        },
      ],
    },
  );

  assert.equal(plan.kind, "setup-plan");
  assert.equal(plan.v, 1);
  assert.equal(plan.mode, "dry-run");
  assert.deepEqual(plan.selectedProviders, ["claude", "codex"]);
  assert.deepEqual(plan.selectedNotifications, ["claude"]);
  assert.equal(plan.notificationSound, "Glass");
  assert.deepEqual(
    plan.providers.map(({ provider, state, selected }) => ({
      provider,
      state,
      selected,
    })),
    [
      { provider: "claude", state: "eligible", selected: true },
      { provider: "codex", state: "eligible", selected: true },
      { provider: "gemini", state: "blocked", selected: false },
      { provider: "opencode", state: "unavailable", selected: false },
    ],
  );
  assert.deepEqual(plan.providers[0]?.notifications.coverage, {
    ready: "pre-final-silent",
    attention: "covered",
    failure: "covered",
  });
  assert.deepEqual(plan.providers[1]?.notifications.coverage, {
    ready: "pre-final-silent",
    attention: "covered",
    failure: "not-covered",
  });
  assert.equal(plan.providers[1]?.notifications.defaultSelected, false);
  assert.equal(
    plan.providers[1]?.warnings.some(
      ({ code }) => code === "duplicate-native-notifications",
    ),
    true,
  );
  assert.deepEqual(
    plan.providers[1]?.warnings.map(({ code }) => code),
    [
      "codex-effective-default",
      "codex-custom-notify",
      "duplicate-native-notifications",
    ],
  );
  assert.deepEqual(plan.guidance, [
    {
      kind: "aider",
      state: "guidance-only",
      command:
        "AIDER_NOTIFICATIONS_COMMAND='side-glance notify --source aider --kind turn.completed'",
      message:
        "Aider remains a manual notification bridge; setup will not replace its notification command.",
    },
  ]);
});

test("setup parser rejects ambiguous provider and option selections", () => {
  const context = {
    command: "setup" as const,
    execution: "durable" as const,
    interactive: true,
  };
  const invalid: readonly [readonly string[], RegExp][] = [
    [["--providers", ""], /must not be empty/u],
    [["--providers", "claude,,codex"], /empty provider/u],
    [["--providers", "claude,claude"], /duplicate provider/u],
    [["--providers", "claude,cursor"], /provider must be/u],
    [["--dry-run", "--dry-run"], /duplicate option/u],
    [["--wat"], /unknown option/u],
    [["--home", "relative/home", "--dry-run"], /absolute path/u],
    [["--executable", "relative/side-glance", "--dry-run"], /absolute path/u],
  ];

  for (const [args, expected] of invalid) {
    assert.throws(() => parseSetupArguments(args, context), expected);
  }
});

test("setup parser rejects invalid notification automation before planning", () => {
  const context = {
    command: "setup" as const,
    execution: "durable" as const,
    interactive: false,
  };
  const invalid: readonly [readonly string[], RegExp][] = [
    [
      [
        "--providers",
        "claude",
        "--notifications",
        "codex",
        "--yes",
      ],
      /must also be selected/u,
    ],
    [
      ["--providers", "claude", "--notifications", "none,claude", "--yes"],
      /cannot combine none/u,
    ],
    [
      ["--providers", "claude", "--notifications", "none", "--notification-sound", "Glass", "--yes"],
      /requires a non-empty/u,
    ],
    [
      ["--providers", "claude", "--notifications", "claude", "--notification-sound", "Bad/Sound", "--yes"],
      /safe installed sound/u,
    ],
    [
      ["--providers", "claude", "--notifications", "claude", "--notification-sound", "Bell\u0007", "--yes"],
      /safe installed sound/u,
    ],
  ];

  for (const [args, expected] of invalid) {
    assert.throws(() => parseSetupArguments(args, context), expected);
  }
});

test("setup carries an explicit legacy Stoplight migration decision", () => {
  const parsed = parseSetupArguments(
    [
      "--providers",
      "claude,codex",
      "--notifications",
      "none",
      "--migrate-legacy-stoplight",
      "--yes",
    ],
    { command: "setup", execution: "durable", interactive: false },
  );
  assert.equal(parsed.migrateLegacyStoplight, true);

  const claude = {
    ...providerObservation("claude", "eligible", "not-configured", "update"),
    legacyStoplightHooks: 5,
  };
  const plan = createSetupPlan(parsed, {
    ...planDependencies(),
    providers: [
      claude,
      providerObservation("codex", "eligible", "ready"),
      providerObservation("gemini", "unavailable", "unknown"),
      providerObservation("opencode", "unavailable", "unknown"),
    ],
  });
  assert.equal(plan.providers[0]?.legacyStoplightHooks, 5);
  assert.equal(plan.providers[0]?.migrateLegacyStoplight, true);

  assert.throws(
    () =>
      parseSetupArguments(
        [
          "--providers",
          "codex",
          "--notifications",
          "none",
          "--migrate-legacy-stoplight",
          "--yes",
        ],
        { command: "setup", execution: "durable", interactive: false },
      ),
    /requires Claude/u,
  );
});

test("non-interactive setup requires a dry-run or a completely specified apply", () => {
  const context = {
    command: "setup" as const,
    execution: "durable" as const,
    interactive: false,
  };

  assert.throws(
    () => parseSetupArguments([], context),
    /Non-interactive setup requires --dry-run/u,
  );
  assert.throws(
    () => parseSetupArguments(["--yes"], context),
    /--yes requires both --providers/u,
  );
  assert.throws(
    () =>
      parseSetupArguments(
        ["--providers", "claude", "--notifications", "none"],
        context,
      ),
    /Non-interactive setup requires --dry-run/u,
  );
  assert.throws(
    () => parseSetupArguments(["--json"], context),
    /--json requires --dry-run/u,
  );

  assert.deepEqual(parseSetupArguments(["--dry-run", "--json"], context), {
    notificationsSpecified: false,
    dryRun: true,
    yes: false,
    json: true,
  });
  assert.deepEqual(
    parseSetupArguments(
      ["--providers", "codex", "--notifications", "none", "--yes"],
      context,
    ),
    {
      providers: ["codex"],
      notifications: [],
      notificationsSpecified: true,
      dryRun: false,
      yes: true,
      json: false,
    },
  );
});

test("durable setup rejects bootstrap-only install selection", () => {
  assert.throws(
    () =>
      parseSetupArguments(["--install", "homebrew", "--dry-run"], {
        command: "init",
        execution: "durable",
        interactive: false,
      }),
    /accepted only by ephemeral/u,
  );
  assert.throws(
    () =>
      parseSetupArguments(["--install", "none"], {
        command: "init",
        execution: "ephemeral",
        interactive: true,
      }),
    /requires --dry-run/u,
  );
  assert.equal(
    parseSetupArguments(["--install", "none", "--dry-run"], {
      command: "init",
      execution: "ephemeral",
      interactive: false,
    }).installMethod,
    "none",
  );
});

test("setup planner applies the notification default matrix deterministically", () => {
  const baseProviders: SetupProviderObservation[] = [
    providerObservation("claude", "eligible", "ready", "unchanged"),
    providerObservation("codex", "eligible", "unknown", "unchanged"),
    providerObservation("gemini", "eligible", "disabled", "unchanged"),
    providerObservation("opencode", "eligible", "unavailable", "unchanged"),
  ];
  const request = {
    notificationsSpecified: false,
    dryRun: true,
    yes: false,
    json: true,
  } as const;

  const available = createSetupPlan(request, {
    ...planDependencies(),
    providers: baseProviders,
  });
  assert.deepEqual(available.selectedNotifications, ["gemini", "opencode"]);
  assert.deepEqual(
    available.providers.map(({ notifications }) => ({
      selectable: notifications.selectable,
      defaultSelected: notifications.defaultSelected,
      recommendation: notifications.recommendation,
    })),
    [
      {
        selectable: true,
        defaultSelected: false,
        recommendation: "prefer-native",
      },
      {
        selectable: true,
        defaultSelected: false,
        recommendation: "leave-off-unverified",
      },
      {
        selectable: true,
        defaultSelected: true,
        recommendation: "enable-side-glance",
      },
      {
        selectable: true,
        defaultSelected: true,
        recommendation: "enable-side-glance",
      },
    ],
  );

  for (const status of ["unavailable", "unsupported"] as const) {
    const degraded = createSetupPlan(request, {
      ...planDependencies(),
      notificationBackend: { status, backend: null },
      providers: baseProviders,
    });
    assert.deepEqual(degraded.selectedNotifications, []);
    assert.equal(
      degraded.providers.every(
        ({ notifications }) =>
          !notifications.selectable && !notifications.defaultSelected,
      ),
      true,
    );
  }
});

test("setup planner rejects unavailable selections and undeliverable explicit notifications", () => {
  const providers = [
    providerObservation("claude", "eligible", "not-configured"),
    providerObservation("codex", "eligible", "not-configured"),
    providerObservation("gemini", "blocked", "not-configured"),
    providerObservation("opencode", "unavailable", "not-configured"),
  ];

  assert.throws(
    () =>
      createSetupPlan(
        {
          providers: ["gemini"],
          notifications: [],
          notificationsSpecified: true,
          dryRun: true,
          yes: false,
          json: true,
        },
        { ...planDependencies(), providers },
      ),
    /gemini is not eligible/u,
  );
  assert.throws(
    () =>
      createSetupPlan(
        {
          providers: ["claude"],
          notifications: ["claude"],
          notificationsSpecified: true,
          dryRun: true,
          yes: false,
          json: true,
        },
        {
          ...planDependencies(),
          notificationBackend: { status: "unavailable", backend: null },
          providers,
        },
      ),
    /not currently deliverable/u,
  );
});

test("setup-plan projection omits untrusted raw configuration values", () => {
  const secret = "PRIVATE_CONFIG_VALUE_793f01";
  const providers = [
    {
      ...providerObservation("claude", "eligible", "not-configured"),
      rawConfiguration: { apiKey: secret },
    },
    providerObservation("codex", "eligible", "ready"),
    providerObservation("gemini", "blocked", "unknown"),
    providerObservation("opencode", "unavailable", "unknown"),
  ] as SetupProviderObservation[];
  const plan = createSetupPlan(
    {
      notificationsSpecified: false,
      dryRun: true,
      yes: false,
      json: true,
    },
    {
      ...planDependencies(),
      providers,
      rawProbeOutput: secret,
    } as Parameters<typeof createSetupPlan>[1],
  );

  const serialized = JSON.stringify(plan);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes("rawConfiguration"), false);
  assert.equal(serialized.includes("rawProbeOutput"), false);
});

test("setup planner exposes guidance-only entries conditionally", () => {
  const providers = [
    providerObservation("claude", "unavailable", "unknown"),
    providerObservation("codex", "unavailable", "unknown"),
    providerObservation("gemini", "guidance-only", "unknown"),
    providerObservation("opencode", "blocked", "unknown"),
  ];
  const plan = createSetupPlan(
    {
      notificationsSpecified: false,
      dryRun: true,
      yes: false,
      json: true,
    },
    {
      ...planDependencies(),
      providers,
      guidance: [
        { kind: "aider", available: false, command: "unused" },
        {
          kind: "generic",
          available: true,
          command: "side-glance run -- <command>",
        },
      ],
    },
  );

  assert.deepEqual(plan.selectedProviders, []);
  assert.deepEqual(plan.selectedNotifications, []);
  assert.equal(plan.notificationSound, null);
  assert.deepEqual(plan.guidance, [
    {
      kind: "generic",
      state: "guidance-only",
      command: "side-glance run -- <command>",
      message:
        "Use the supervised wrapper for commands without a managed provider integration.",
    },
  ]);
});

function planDependencies() {
  return {
    homeDirectory: "/Users/example",
    executablePath: "/opt/homebrew/bin/side-glance",
    notificationBackend: {
      status: "available" as const,
      backend: "osascript" as const,
    },
    providers: [] as SetupProviderObservation[],
  };
}

function providerObservation(
  provider: SetupProviderObservation["provider"],
  state: SetupProviderObservation["state"],
  nativeStatus: SetupProviderObservation["nativeNotifications"]["status"],
  action: "create" | "update" | "unchanged" = "unchanged",
): SetupProviderObservation {
  return {
    provider,
    state,
    integrationStatus: "not-installed",
    reason:
      state === "blocked"
        ? "unsafe-config-target"
        : state === "unavailable"
          ? "binary-not-found"
          : undefined,
    ...(state === "eligible"
      ? {
          target: {
            path: `/Users/example/.config/${provider}/settings.json`,
            action,
            managedHookCount: provider === "opencode" ? 1 : 4,
          },
        }
      : {}),
    nativeNotifications: { status: nativeStatus },
  };
}
