import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  inspectProviderHooks,
  installProviderHooks,
} from "../../src/adapters/installers.ts";
import { createDurableSetupDiscovery } from "../../src/cli/setup-discovery.ts";
import { createSetupPlan, type SetupRequest } from "../../src/cli/setup.ts";
import { SetupTransactionError } from "../../src/cli/setup-transaction.ts";

const version = "0.1.0-beta.11";

test("discovers canonical eligibility and creates an exact read-only provider plan", async (context) => {
  const fixture = await setupFixture(context);
  const request = setupRequest(["claude"], []);
  const discovery = await createDurableSetupDiscovery(request, {
    defaultHomeDirectory: fixture.home,
    defaultExecutablePath: fixture.executable,
    expectedVersion: version,
    environment: { PATH: fixture.bin },
    platform: "darwin",
    pathProbe: async (candidate) =>
      candidate === "claude" || candidate === "/usr/bin/osascript",
    probeVersion: async () => ({ exitCode: 0, stdout: `${version}\n` }),
  });
  const plan = createSetupPlan(request, discovery.dependencies);

  assert.deepEqual(
    plan.providers.map(({ provider, state }) => ({ provider, state })),
    [
      { provider: "claude", state: "eligible" },
      { provider: "codex", state: "unavailable" },
      { provider: "gemini", state: "unavailable" },
      { provider: "opencode", state: "unavailable" },
    ],
  );
  assert.equal(plan.providers[0]?.target?.action, "create");
  assert.deepEqual(plan.selectedNotifications, []);
  await assert.rejects(
    () => readFile(path.join(fixture.home, ".claude", "settings.json"), "utf8"),
    /ENOENT/u,
  );
});

test("applies multiple exact plans under one transaction and re-runs idempotently", async (context) => {
  const fixture = await setupFixture(context);
  const request = setupRequest(["claude", "codex"], []);
  const options = {
    defaultHomeDirectory: fixture.home,
    defaultExecutablePath: fixture.executable,
    expectedVersion: version,
    environment: { PATH: fixture.bin },
    platform: "darwin" as const,
    pathProbe: async (candidate: string) =>
      candidate === "claude" ||
      candidate === "codex" ||
      candidate === "/usr/bin/osascript",
    probeVersion: async () => ({ exitCode: 0, stdout: `${version}\n` }),
  };
  const first = await createDurableSetupDiscovery(request, options);
  const firstPlan = createSetupPlan(request, first.dependencies);
  const applied = await first.apply(firstPlan);

  assert.deepEqual(
    applied.providers.map(({ id, changed }) => ({ id, changed })),
    [
      { id: "claude", changed: true },
      { id: "codex", changed: true },
    ],
  );
  const claude = JSON.parse(
    await readFile(path.join(fixture.home, ".claude", "settings.json"), "utf8"),
  );
  const codex = JSON.parse(
    await readFile(path.join(fixture.home, ".codex", "hooks.json"), "utf8"),
  );
  assert.ok(JSON.stringify(claude).includes(fixture.executable));
  assert.ok(JSON.stringify(codex).includes(fixture.executable));
  assert.match(JSON.stringify(claude), /--discover-terminal/u);
  assert.match(JSON.stringify(codex), /--discover-terminal/u);

  const second = await createDurableSetupDiscovery(request, options);
  const secondPlan = createSetupPlan(request, second.dependencies);
  assert.deepEqual(
    secondPlan.providers
      .filter(({ selected }) => selected)
      .map(({ target }) => target?.action),
    ["unchanged", "unchanged"],
  );
  const reapplied = await second.apply(secondPlan);
  assert.equal(reapplied.providers.every(({ changed }) => !changed), true);
  assert.equal(reapplied.providers.every(({ backupPath }) => !backupPath), true);
});

test("applies the fresh-tab zsh reset in the same verified setup transaction", async (context) => {
  const fixture = await setupFixture(context);
  const zshrc = path.join(fixture.home, ".zshrc");
  const original = "export KEEP_ME=1\n";
  await writeFile(zshrc, original, { mode: 0o640 });
  const request: SetupRequest = {
    ...setupRequest(["claude"], []),
    freshTabs: true,
  };
  const options = {
    defaultHomeDirectory: fixture.home,
    defaultExecutablePath: fixture.executable,
    expectedVersion: version,
    environment: { PATH: fixture.bin, SHELL: "/bin/zsh" },
    platform: "darwin" as const,
    pathProbe: async (candidate: string) => candidate === "claude",
    probeVersion: async () => ({ exitCode: 0, stdout: `${version}\n` }),
  };

  const discovery = await createDurableSetupDiscovery(request, options);
  const plan = createSetupPlan(request, discovery.dependencies);
  assert.equal(plan.freshTabs.managed, true);
  assert.equal(plan.freshTabs.enabled, true);
  assert.equal(plan.freshTabs.target?.action, "update");

  const applied = await discovery.apply(plan);
  assert.deepEqual(
    applied.providers.map(({ id, changed }) => ({ id, changed })),
    [
      { id: "claude", changed: true },
      { id: "fresh-tabs", changed: true },
    ],
  );
  const installed = await readFile(zshrc, "utf8");
  assert.ok(installed.startsWith(original));
  assert.match(installed, /builtin printf '\\e\]111\\a'/u);
  assert.equal((await stat(zshrc)).mode & 0o777, 0o640);

  const rerun = await createDurableSetupDiscovery(request, options);
  const rerunPlan = createSetupPlan(request, rerun.dependencies);
  assert.equal(rerunPlan.freshTabs.target?.action, "unchanged");
  const reapplied = await rerun.apply(rerunPlan);
  assert.equal(reapplied.providers.at(-1)?.id, "fresh-tabs");
  assert.equal(reapplied.providers.at(-1)?.changed, false);
});

test("rerunning setup upgrades otherwise-installed hooks for plain provider commands", async (context) => {
  const fixture = await setupFixture(context);
  await installProviderHooks({
    provider: "codex",
    homeDirectory: fixture.home,
    executablePath: fixture.executable,
  });
  const before = await inspectProviderHooks({
    provider: "codex",
    homeDirectory: fixture.home,
  });
  assert.equal(before.integrationStatus, "installed");
  assert.ok(before.managedHooks.every(({ directSurfaceConfigured }) => !directSurfaceConfigured));

  const request = setupRequest(["codex"], []);
  const discovery = await createDurableSetupDiscovery(request, {
    defaultHomeDirectory: fixture.home,
    defaultExecutablePath: fixture.executable,
    expectedVersion: version,
    environment: { PATH: fixture.bin },
    platform: "darwin",
    pathProbe: async (candidate) => candidate === "codex",
    probeVersion: async () => ({ exitCode: 0, stdout: `${version}\n` }),
  });
  const plan = createSetupPlan(request, discovery.dependencies);
  assert.equal(
    plan.providers.find(({ provider }) => provider === "codex")?.target?.action,
    "update",
  );
  await discovery.apply(plan);

  const after = await inspectProviderHooks({
    provider: "codex",
    homeDirectory: fixture.home,
  });
  assert.ok(after.managedHooks.every(({ directSurfaceConfigured }) => directSurfaceConfigured));
});

test("guided discovery cannot apply two Claude painters and explicitly migrates exact legacy Stoplight hooks", async (context) => {
  const fixture = await setupFixture(context);
  const claudeDirectory = path.join(fixture.home, ".claude");
  const claudePath = path.join(claudeDirectory, "settings.json");
  await mkdir(claudeDirectory, { recursive: true });
  const original = `${JSON.stringify({
    hooks: {
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: "bash $HOME/.claude/hooks/stoplight.sh done",
            },
            { type: "command", command: "/usr/bin/unrelated-hook" },
          ],
        },
      ],
    },
  }, null, 2)}\n`;
  await writeFile(claudePath, original, { mode: 0o600 });
  const options = {
    defaultHomeDirectory: fixture.home,
    defaultExecutablePath: fixture.executable,
    expectedVersion: version,
    environment: { PATH: fixture.bin },
    platform: "darwin" as const,
    pathProbe: async (candidate: string) =>
      candidate === "claude" || candidate === "codex",
    probeVersion: async () => ({ exitCode: 0, stdout: `${version}\n` }),
  };

  const unresolvedRequest = setupRequest(["claude"], []);
  const unresolved = await createDurableSetupDiscovery(unresolvedRequest, options);
  const unresolvedPlan = createSetupPlan(
    unresolvedRequest,
    unresolved.dependencies,
  );
  assert.equal(unresolvedPlan.providers[0]?.legacyStoplightHooks, 1);
  assert.equal(unresolvedPlan.providers[0]?.migrateLegacyStoplight, false);
  await assert.rejects(
    () => unresolved.apply(unresolvedPlan),
    (error: unknown) => {
      assert.ok(error instanceof SetupTransactionError);
      assert.equal(error.code, "plan-changed");
      return true;
    },
  );
  assert.equal(await readFile(claudePath, "utf8"), original);

  const skipRequest = setupRequest(["codex"], []);
  const skippedClaude = await createDurableSetupDiscovery(skipRequest, options);
  const skipPlan = createSetupPlan(skipRequest, skippedClaude.dependencies);
  await skippedClaude.apply(skipPlan);
  assert.equal(await readFile(claudePath, "utf8"), original);
  assert.match(
    await readFile(path.join(fixture.home, ".codex", "hooks.json"), "utf8"),
    /--discover-terminal/u,
  );

  const migrationRequest = {
    ...setupRequest(["claude", "codex"], []),
    migrateLegacyStoplight: true,
  };
  const migration = await createDurableSetupDiscovery(migrationRequest, options);
  const migrationPlan = createSetupPlan(
    migrationRequest,
    migration.dependencies,
  );
  assert.equal(migrationPlan.providers[0]?.migrateLegacyStoplight, true);
  const result = await migration.apply(migrationPlan);
  assert.deepEqual(
    result.providers.map(({ id }) => id),
    ["claude", "codex"],
  );
  assert.ok(result.providers[0]?.backupPath);
  const installed = await readFile(claudePath, "utf8");
  assert.doesNotMatch(installed, /\.claude\/hooks\/stoplight\.sh/u);
  assert.match(installed, /\/usr\/bin\/unrelated-hook/u);
  assert.match(installed, /--discover-terminal/u);
  assert.match(
    await readFile(path.join(fixture.home, ".codex", "hooks.json"), "utf8"),
    /--discover-terminal/u,
  );
});

test("revalidates the durable executable immediately before any provider write", async (context) => {
  const fixture = await setupFixture(context);
  const request = setupRequest(["claude"], []);
  const discovery = await createDurableSetupDiscovery(request, {
    defaultHomeDirectory: fixture.home,
    defaultExecutablePath: fixture.executable,
    expectedVersion: version,
    environment: { PATH: fixture.bin },
    platform: "darwin",
    pathProbe: async (candidate) => candidate === "claude",
    probeVersion: async () => ({ exitCode: 0, stdout: `${version}\n` }),
  });
  const plan = createSetupPlan(request, discovery.dependencies);
  const replacement = path.join(fixture.home, "replacement");
  await writeFile(replacement, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  await rename(replacement, fixture.executable);

  await assert.rejects(
    () => discovery.apply(plan),
    (error: unknown) => {
      assert.ok(error instanceof SetupTransactionError);
      assert.equal(error.code, "plan-changed");
      return true;
    },
  );
  await assert.rejects(
    () => readFile(path.join(fixture.home, ".claude", "settings.json"), "utf8"),
    /ENOENT/u,
  );
});

test("a caught later-provider failure restores exact earlier bytes and mode", async (context) => {
  const fixture = await setupFixture(context);
  const claudeDirectory = path.join(fixture.home, ".claude");
  const claudePath = path.join(claudeDirectory, "settings.json");
  const original = '{"theme":"PRIVATE_UNRELATED_VALUE"}\n';
  await mkdir(claudeDirectory, { recursive: true });
  await writeFile(claudePath, original, { mode: 0o640 });
  const request = setupRequest(["claude", "codex"], []);
  const discovery = await createDurableSetupDiscovery(request, {
    defaultHomeDirectory: fixture.home,
    defaultExecutablePath: fixture.executable,
    expectedVersion: version,
    environment: { PATH: fixture.bin },
    platform: "darwin",
    pathProbe: async (candidate) =>
      candidate === "claude" || candidate === "codex",
    probeVersion: async () => ({ exitCode: 0, stdout: `${version}\n` }),
    beforeProviderApply: (provider) => {
      if (provider === "codex") throw new Error("HOSTILE_INJECTED_FAILURE");
    },
  });
  const plan = createSetupPlan(request, discovery.dependencies);

  await assert.rejects(
    () => discovery.apply(plan),
    (error: unknown) => {
      assert.ok(error instanceof SetupTransactionError);
      assert.equal(error.code, "apply-failed");
      assert.doesNotMatch(error.message, /HOSTILE|PRIVATE/u);
      assert.deepEqual(error.rollback, [
        { id: "claude", configPath: claudePath, status: "restored" },
      ]);
      return true;
    },
  );
  assert.equal(await readFile(claudePath, "utf8"), original);
  assert.equal((await stat(claudePath)).mode & 0o777, 0o640);
  await assert.rejects(
    () => readFile(path.join(fixture.home, ".codex", "hooks.json"), "utf8"),
    /ENOENT/u,
  );
});

test("Aider guidance is executable and fails closed around an existing custom notifier", async (context) => {
  const fixture = await setupFixture(context);
  const request: SetupRequest = {
    notificationsSpecified: false,
    dryRun: true,
    yes: false,
    json: true,
  };
  await writeFile(
    path.join(fixture.home, ".aider.conf.yml"),
    "notifications-command: /usr/local/bin/custom-alert\n",
    { mode: 0o600 },
  );
  const custom = await createDurableSetupDiscovery(request, {
    defaultHomeDirectory: fixture.home,
    defaultExecutablePath: fixture.executable,
    expectedVersion: version,
    environment: { PATH: fixture.bin },
    platform: "darwin",
    pathProbe: async (candidate) => candidate === "aider",
    probeVersion: async () => ({ exitCode: 0, stdout: `${version}\n` }),
  });
  const customPlan = createSetupPlan(request, custom.dependencies);
  assert.deepEqual(customPlan.guidance, [
    {
      kind: "aider",
      state: "guidance-only",
      command:
        "side-glance doctor --json # Existing Aider notification command detected; review it before enabling the Side Glance bridge.",
      message:
        "Aider remains a manual notification bridge; setup will not replace its notification command.",
    },
    {
      kind: "generic",
      state: "guidance-only",
      command: "side-glance run --notify-on-exit -- <command>",
      message:
        "Use the supervised wrapper for commands without a managed provider integration.",
    },
  ]);

  await writeFile(path.join(fixture.home, ".aider.conf.yml"), "theme: dark\n", {
    mode: 0o600,
  });
  const available = await createDurableSetupDiscovery(request, {
    defaultHomeDirectory: fixture.home,
    defaultExecutablePath: fixture.executable,
    expectedVersion: version,
    environment: { PATH: fixture.bin },
    platform: "darwin",
    pathProbe: async (candidate) => candidate === "aider",
    probeVersion: async () => ({ exitCode: 0, stdout: `${version}\n` }),
  });
  assert.match(
    createSetupPlan(request, available.dependencies).guidance[0]?.command ?? "",
    /^AIDER_NOTIFICATIONS_COMMAND=.*side-glance run --label "Aider" -- aider$/u,
  );
});

function setupRequest(
  providers: SetupRequest["providers"],
  notifications: SetupRequest["notifications"],
): SetupRequest {
  return {
    providers,
    notifications,
    notificationsSpecified: true,
    dryRun: false,
    yes: true,
    json: true,
  };
}

async function setupFixture(context: test.TestContext) {
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-setup-discovery-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const bin = path.join(home, "bin");
  const executable = path.join(bin, "side-glance");
  await mkdir(bin, { recursive: true });
  await writeFile(executable, "#!/bin/sh\nexit 0\n");
  await chmod(executable, 0o700);
  return { home, bin, executable };
}
