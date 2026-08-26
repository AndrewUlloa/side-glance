import assert from "node:assert/strict";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyProviderHookPlan,
  inspectProviderHooks,
  installProviderHooks,
  planProviderHookInstall,
  uninstallProviderHooks,
  type InstallableProvider,
} from "../../src/adapters/installers.ts";
import {
  acquireConfigWriterLock,
  applyConfigTargetPlan,
  backupConfigTargetPlan,
  captureConfigTarget,
  planConfigTarget,
  planConfigTargetRemoval,
  releaseConfigWriterLock,
  restoreConfigTargetApplication,
  verifyConfigTargetApplication,
  verifyConfigTargetPlan,
  withConfigWriterLock,
} from "../../src/adapters/config-target.ts";

async function fixtureHome(context: test.TestContext): Promise<string> {
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-installer-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  return home;
}

async function executableFixture(home: string): Promise<string> {
  const executable = path.join(home, "bin", "side-glance executable");
  await mkdir(path.dirname(executable), { recursive: true });
  await writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  await chmod(executable, 0o700);
  return executable;
}

function configPath(home: string, provider: InstallableProvider): string {
  switch (provider) {
    case "claude":
      return path.join(home, ".claude", "settings.json");
    case "codex":
      return path.join(home, ".codex", "hooks.json");
    case "gemini":
      return path.join(home, ".gemini", "settings.json");
  }
}

test("installs idempotently, backs up once, and preserves existing hook groups", async (context) => {
  for (const provider of ["claude", "codex", "gemini"] as const) {
    const home = await fixtureHome(context);
    const executablePath = await executableFixture(home);
    const targetPath = configPath(home, provider);
    await mkdir(path.dirname(targetPath), { recursive: true });
    const original = {
      untouched: { theme: "personal" },
      hooks: {
        Stop: [
          {
            matcher: "existing",
            hooks: [{ type: "command", command: "/usr/bin/existing-hook" }],
          },
        ],
      },
    };
    await writeFile(targetPath, `${JSON.stringify(original, null, 2)}\n`, {
      mode: 0o600,
    });

    const first = await installProviderHooks({
      provider,
      homeDirectory: home,
      executablePath,
    });
    const afterFirst = await readFile(targetPath, "utf8");
    const second = await installProviderHooks({
      provider,
      homeDirectory: home,
      executablePath,
    });
    const installed = JSON.parse(await readFile(targetPath, "utf8"));

    assert.equal(first.changed, true);
    assert.ok(first.backupPath);
    assert.equal(second.changed, false);
    assert.equal(afterFirst, await readFile(targetPath, "utf8"));
    assert.deepEqual(installed.untouched, original.untouched);
    assert.deepEqual(installed.hooks.Stop[0], original.hooks.Stop[0]);
    const commands = Object.values(installed.hooks)
      .flatMap((groups) => groups as Array<{ hooks: Array<{ command: string }> }>)
      .flatMap((group) => group.hooks)
      .map((hook) => hook.command);
    assert.ok(commands.some((command) => command.includes(executablePath)));
    assert.ok(commands.every((command) => path.isAbsolute(command) || command.includes(executablePath)));

    const backups = (await readdir(path.dirname(targetPath))).filter((name) =>
      name.includes(".side-glance-backup-"),
    );
    assert.equal(backups.length, 1);
  }
});

test("installs optional notification flags into every managed hook", async (context) => {
  const home = await fixtureHome(context);
  const executablePath = await executableFixture(home);

  await installProviderHooks({
    provider: "claude",
    homeDirectory: home,
    executablePath,
    notifications: true,
    notificationSound: "Glass",
  });

  const installed = JSON.parse(
    await readFile(configPath(home, "claude"), "utf8"),
  );
  const commands = Object.values(installed.hooks)
    .flatMap((groups) => groups as Array<{ hooks: Array<{ command: string }> }>)
    .flatMap((group) => group.hooks)
    .map((hook) => hook.command);
  assert.ok(commands.length > 0);
  assert.ok(commands.every((command) => command.includes(" --notifications")));
  assert.ok(
    commands.every((command) =>
      command.endsWith(" --notification-sound 'Glass'"),
    ),
  );
  const inspection = await inspectProviderHooks({
    provider: "claude",
    homeDirectory: home,
  });
  assert.equal(inspection.integrationStatus, "installed");
  assert.equal(inspection.managedHooks.length, inspection.expectedEvents);
  assert.ok(inspection.managedHooks.every((hook) => hook.notifications));
  assert.ok(inspection.managedHooks.every((hook) => hook.soundConfigured));
  assert.ok(inspection.managedHooks.every((hook) => hook.timeout !== null));
  assert.equal(inspection.expectedEvents, 9);
  assert.deepEqual(
    inspection.managedHooks
      .map(({ event }) => event)
      .filter((event) => event.startsWith("Subagent"))
      .sort(),
    ["SubagentStart", "SubagentStop"],
  );
});

test("reports partial integration when duplicate hooks hide missing events", async (context) => {
  const home = await fixtureHome(context);
  const targetPath = configPath(home, "claude");
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(
    targetPath,
    JSON.stringify({
      hooks: {
        Stop: Array.from({ length: 9 }, () => ({
          hooks: [
            {
              type: "command",
              command:
                "SIDE_GLANCE_MANAGED_HOOK=1 '/usr/local/bin/side-glance' hook --provider claude --json",
            },
          ],
        })),
      },
    }),
  );

  const inspection = await inspectProviderHooks({
    provider: "claude",
    homeDirectory: home,
  });

  assert.equal(inspection.managedHooks.length, inspection.expectedEvents);
  assert.deepEqual(
    [...new Set(inspection.managedHooks.map((hook) => hook.event))],
    ["Stop"],
  );
  assert.equal(inspection.integrationStatus, "partial");
});

test("installs provider-specific bounded hook timeouts", async (context) => {
  const expectations = {
    claude: { ordinary: 10, teardown: 3 },
    codex: { ordinary: 10, teardown: 3 },
    gemini: { ordinary: 10_000, teardown: 3_000 },
  } as const;

  for (const provider of ["claude", "codex", "gemini"] as const) {
    const home = await fixtureHome(context);
    const executablePath = await executableFixture(home);
    await installProviderHooks({ provider, homeDirectory: home, executablePath });
    const installed = JSON.parse(await readFile(configPath(home, provider), "utf8"));
    const commandFor = (eventName: string) =>
      installed.hooks[eventName].at(-1).hooks.at(-1);

    assert.equal(commandFor("SessionStart").timeout, expectations[provider].ordinary);
    assert.equal(commandFor("SessionEnd").timeout, expectations[provider].teardown);
  }
});

test("rejects unsafe notification sound values without changing provider config", async (context) => {
  const home = await fixtureHome(context);
  const executablePath = await executableFixture(home);
  const targetPath = configPath(home, "claude");
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, '{"theme":"untouched"}\n');

  await assert.rejects(
    () =>
      installProviderHooks({
        provider: "claude",
        homeDirectory: home,
        executablePath,
        notifications: true,
        notificationSound: "bad\nsound",
      }),
    /sound|control/i,
  );
  await assert.rejects(
    () =>
      installProviderHooks({
        provider: "claude",
        homeDirectory: home,
        executablePath,
        notifications: true,
        notificationSound: "x".repeat(65),
      }),
    /sound|64/i,
  );
  assert.equal(await readFile(targetPath, "utf8"), '{"theme":"untouched"}\n');
});

test("uninstall removes only Side Glance-owned handlers and preserves Codex notify", async (context) => {
  const home = await fixtureHome(context);
  const executablePath = await executableFixture(home);
  const hooksPath = configPath(home, "codex");
  const codexConfigPath = path.join(home, ".codex", "config.toml");
  await mkdir(path.dirname(hooksPath), { recursive: true });
  await writeFile(
    hooksPath,
    JSON.stringify({
      hooks: {
        Stop: [
          {
            hooks: [
              { type: "command", command: "/usr/bin/existing-one" },
              { type: "command", command: "/usr/bin/existing-two" },
            ],
          },
        ],
      },
    }),
    { mode: 0o600 },
  );
  const notifyConfig = 'notify = ["SkyComputerUseClient", "agent-turn-complete"]\n';
  await writeFile(codexConfigPath, notifyConfig, { mode: 0o600 });

  await installProviderHooks({
    provider: "codex",
    homeDirectory: home,
    executablePath,
  });
  const removed = await uninstallProviderHooks({
    provider: "codex",
    homeDirectory: home,
    executablePath,
  });
  const remaining = JSON.parse(await readFile(hooksPath, "utf8"));

  assert.equal(removed.changed, true);
  assert.deepEqual(remaining.hooks.Stop, [
    {
      hooks: [
        { type: "command", command: "/usr/bin/existing-one" },
        { type: "command", command: "/usr/bin/existing-two" },
      ],
    },
  ]);
  assert.equal(await readFile(codexConfigPath, "utf8"), notifyConfig);
});

test("refuses malformed and symlinked provider configuration", async (context) => {
  const home = await fixtureHome(context);
  const executablePath = await executableFixture(home);
  const targetPath = configPath(home, "claude");
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, "{malformed", { mode: 0o600 });

  await assert.rejects(
    () =>
      installProviderHooks({
        provider: "claude",
        homeDirectory: home,
        executablePath,
      }),
    /parse|JSON|malformed/i,
  );
  assert.equal(await readFile(targetPath, "utf8"), "{malformed");

  await rm(targetPath);
  const outside = path.join(home, "outside.json");
  await writeFile(outside, "{}", { mode: 0o600 });
  await symlink(outside, targetPath);
  await assert.rejects(
    () =>
      installProviderHooks({
        provider: "claude",
        homeDirectory: home,
        executablePath,
      }),
    /symbolic link/i,
  );
  assert.equal(await readFile(outside, "utf8"), "{}");
});

test("refuses a symlinked provider parent without writing through it", async (context) => {
  const home = await fixtureHome(context);
  const executablePath = await executableFixture(home);
  const outsideDirectory = path.join(home, "outside-claude");
  const outsideConfig = path.join(outsideDirectory, "settings.json");
  await mkdir(outsideDirectory);
  await writeFile(outsideConfig, '{"outside":"untouched"}\n', { mode: 0o640 });
  await symlink(outsideDirectory, path.join(home, ".claude"));

  await assert.rejects(
    () =>
      installProviderHooks({
        provider: "claude",
        homeDirectory: home,
        executablePath,
      }),
    /parent|directory|symbolic link/i,
  );
  assert.equal(await readFile(outsideConfig, "utf8"), '{"outside":"untouched"}\n');
  assert.deepEqual(await readdir(outsideDirectory), ["settings.json"]);
});

test("writes provider backups from the captured bytes with private permissions", async (context) => {
  const home = await fixtureHome(context);
  const executablePath = await executableFixture(home);
  const targetPath = configPath(home, "claude");
  const original = '{"private":"captured value"}\n';
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, original, { mode: 0o644 });

  const installed = await installProviderHooks({
    provider: "claude",
    homeDirectory: home,
    executablePath,
  });

  assert.ok(installed.backupPath);
  assert.equal(await readFile(installed.backupPath, "utf8"), original);
  assert.equal((await lstat(installed.backupPath)).mode & 0o777, 0o600);
});

test("rejects same-inode edits and target replacements made after capture", async (context) => {
  const home = await fixtureHome(context);
  const targetPath = path.join(home, ".claude", "settings.json");
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, "original", { mode: 0o640 });
  const snapshot = await captureConfigTarget({
    rootDirectory: home,
    targetPath,
    label: "Test provider configuration",
    maxBytes: 1_024,
  });
  const plan = planConfigTarget(snapshot, "desired");

  await writeFile(targetPath, "external");
  await assert.rejects(() => applyConfigTargetPlan(plan), /changed/i);
  assert.equal(await readFile(targetPath, "utf8"), "external");

  const replacementSnapshot = await captureConfigTarget({
    rootDirectory: home,
    targetPath,
    label: "Test provider configuration",
    maxBytes: 1_024,
  });
  const replacementPlan = planConfigTarget(replacementSnapshot, "desired");
  const replacementPath = path.join(home, "replacement.json");
  await writeFile(replacementPath, "external", { mode: 0o640 });
  await rename(replacementPath, targetPath);
  await assert.rejects(() => applyConfigTargetPlan(replacementPlan), /changed/i);
  assert.equal(await readFile(targetPath, "utf8"), "external");
  assert.deepEqual(
    (await readdir(path.dirname(targetPath))).filter((name) =>
      name.includes(".side-glance-backup-"),
    ),
    [],
  );
});

test("restores the captured target when a post-commit failure is caught", async (context) => {
  const home = await fixtureHome(context);
  const targetPath = path.join(home, ".claude", "settings.json");
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, "private original", { mode: 0o640 });
  const snapshot = await captureConfigTarget({
    rootDirectory: home,
    targetPath,
    label: "Test provider configuration",
    maxBytes: 1_024,
  });
  const plan = planConfigTarget(snapshot, "desired", { mode: 0o640 });

  await assert.rejects(
    () =>
      applyConfigTargetPlan(plan, {
        afterCommit: async () => {
          throw new Error("HOSTILE_POST_COMMIT_FAILURE");
        },
      }),
    /post.commit|apply|hostile/i,
  );

  assert.equal(await readFile(targetPath, "utf8"), "private original");
  assert.equal((await lstat(targetPath)).mode & 0o777, 0o640);
});

test("backs up captured bytes before apply and still rejects a later edit", async (context) => {
  const home = await fixtureHome(context);
  const targetPath = path.join(home, ".claude", "settings.json");
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, "captured private bytes", { mode: 0o640 });
  const snapshot = await captureConfigTarget({
    rootDirectory: home,
    targetPath,
    label: "Test provider configuration",
    maxBytes: 1_024,
  });
  const plan = planConfigTarget(snapshot, "desired", {
    backupExisting: true,
    mode: 0o640,
  });

  const backupPath = await backupConfigTargetPlan(plan);
  assert.ok(backupPath);
  await writeFile(targetPath, "external private bytes", { mode: 0o640 });
  await assert.rejects(() => applyConfigTargetPlan(plan), /changed/i);

  assert.equal(await readFile(backupPath, "utf8"), "captured private bytes");
  assert.equal((await lstat(backupPath)).mode & 0o777, 0o600);
  assert.equal(await readFile(targetPath, "utf8"), "external private bytes");
});

test("verifies exact desired state and refuses rollback over an external edit", async (context) => {
  const home = await fixtureHome(context);
  const targetPath = path.join(home, ".claude", "settings.json");
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, "original", { mode: 0o640 });
  const snapshot = await captureConfigTarget({
    rootDirectory: home,
    targetPath,
    label: "Test provider configuration",
    maxBytes: 1_024,
  });
  const plan = planConfigTarget(snapshot, "desired", { mode: 0o640 });
  const application = await applyConfigTargetPlan(plan);

  await verifyConfigTargetPlan(plan);
  await verifyConfigTargetApplication(application);
  await writeFile(targetPath, "external", { mode: 0o640 });
  await assert.rejects(
    () => verifyConfigTargetApplication(application),
    /changed/i,
  );
  await assert.rejects(
    () => restoreConfigTargetApplication(application),
    /changed/i,
  );
  assert.equal(await readFile(targetPath, "utf8"), "external");
});

test("restores exact captured bytes and mode after an applied update", async (context) => {
  const home = await fixtureHome(context);
  const targetPath = path.join(home, ".codex", "hooks.json");
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, "private original", { mode: 0o640 });
  const snapshot = await captureConfigTarget({
    rootDirectory: home,
    targetPath,
    label: "Test provider configuration",
    maxBytes: 1_024,
  });
  const plan = planConfigTarget(snapshot, "desired", { mode: 0o640 });
  const application = await applyConfigTargetPlan(plan);

  await restoreConfigTargetApplication(application);

  assert.equal(await readFile(targetPath, "utf8"), "private original");
  assert.equal((await lstat(targetPath)).mode & 0o777, 0o640);
});

test("verifies an unchanged absent target without creating its parent", async (context) => {
  const home = await fixtureHome(context);
  const targetPath = path.join(home, ".gemini", "settings.json");
  const snapshot = await captureConfigTarget({
    rootDirectory: home,
    targetPath,
    label: "Test provider configuration",
    maxBytes: 1_024,
  });
  const plan = planConfigTargetRemoval(snapshot);

  await verifyConfigTargetPlan(plan);
  await assert.rejects(() => lstat(path.dirname(targetPath)), /ENOENT/u);
});

test("serializes direct configuration writers with an owner-validated lock", async (context) => {
  const home = await fixtureHome(context);
  const executablePath = await executableFixture(home);
  const first = await acquireConfigWriterLock(home);
  await assert.rejects(
    () => acquireConfigWriterLock(home),
    /configuration update is in progress/i,
  );
  await assert.rejects(
    () =>
      installProviderHooks({
        provider: "claude",
        homeDirectory: home,
        executablePath,
      }),
    /configuration update is in progress/i,
  );
  await assert.rejects(() => lstat(path.join(home, ".claude")), /ENOENT/u);
  await releaseConfigWriterLock(first);

  const second = await acquireConfigWriterLock(home);
  await releaseConfigWriterLock(second);
  await assert.rejects(() => lstat(second.lockPath), /ENOENT/u);
});

test("does not unlink a writer lock whose ownership bytes changed", async (context) => {
  const home = await fixtureHome(context);
  const lock = await acquireConfigWriterLock(home);
  await writeFile(lock.lockPath, "external lock owner\n", { mode: 0o600 });

  await assert.rejects(
    () => releaseConfigWriterLock(lock),
    /ownership was lost/i,
  );
  assert.equal(await readFile(lock.lockPath, "utf8"), "external lock owner\n");
});

test("preserves the operation error when lock ownership is lost during failure", async (context) => {
  const home = await fixtureHome(context);
  const sentinel = "HOSTILE_OPERATION_FAILURE";

  await assert.rejects(
    () =>
      withConfigWriterLock(home, async (lock) => {
        await writeFile(lock.lockPath, "external lock owner\n", { mode: 0o600 });
        throw new Error(sentinel);
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, sentinel);
      return true;
    },
  );
  assert.equal(
    await readFile(path.join(home, ".side-glance.config.lock"), "utf8"),
    "external lock owner\n",
  );
});

test("recovers a well-formed writer lock whose owning process has exited", async (context) => {
  const home = await fixtureHome(context);
  const lockPath = path.join(home, ".side-glance.config.lock");
  await writeFile(
    lockPath,
    `${JSON.stringify({ schema: 1, pid: 2_147_483_647, owner: "stale-owner" })}\n`,
    { mode: 0o600 },
  );

  const recovered = await acquireConfigWriterLock(home);
  await releaseConfigWriterLock(recovered);

  await assert.rejects(() => lstat(lockPath), /ENOENT/u);
});

test("recovers an old incomplete writer lock without deleting a fresh one", async (context) => {
  const home = await fixtureHome(context);
  const lockPath = path.join(home, ".side-glance.config.lock");
  await writeFile(lockPath, "", { mode: 0o600 });

  await assert.rejects(
    () => acquireConfigWriterLock(home),
    /configuration update is in progress/i,
  );
  const old = new Date(Date.now() - 120_000);
  await utimes(lockPath, old, old);

  const recovered = await acquireConfigWriterLock(home);
  await releaseConfigWriterLock(recovered);
  await assert.rejects(() => lstat(lockPath), /ENOENT/u);
});

test("redacts hostile provider event names from installer errors", async (context) => {
  const home = await fixtureHome(context);
  const executablePath = await executableFixture(home);
  const targetPath = configPath(home, "claude");
  const sentinel = "PRIVATE_EVENT_KEY\u001b[31m";
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(
    targetPath,
    `${JSON.stringify({ hooks: { [sentinel]: "not-an-array" } })}\n`,
    { mode: 0o600 },
  );

  await assert.rejects(
    () =>
      installProviderHooks({
        provider: "claude",
        homeDirectory: home,
        executablePath,
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /PRIVATE_EVENT_KEY/iu);
      assert.equal(error.message.includes(String.fromCodePoint(27)), false);
      assert.match(error.message, /hook|configuration|shape|array/iu);
      return true;
    },
  );
});

test("revalidates the retained executable immediately before provider apply", async (context) => {
  const home = await fixtureHome(context);
  const executablePath = await executableFixture(home);
  const plan = await planProviderHookInstall({
    provider: "claude",
    homeDirectory: home,
    executablePath,
  });
  const replacement = path.join(home, "replacement-side-glance");
  await writeFile(replacement, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  await rename(replacement, executablePath);

  await assert.rejects(() => applyProviderHookPlan(plan), /executable|identity|changed/i);
  await assert.rejects(
    () => readFile(configPath(home, "claude"), "utf8"),
    /ENOENT/u,
  );
});

test("accepts a stable package-manager bin symlink and preserves its path", async (context) => {
  const home = await fixtureHome(context);
  const executableTarget = await executableFixture(home);
  const stableBin = path.join(home, "stable-prefix", "bin", "side-glance");
  await mkdir(path.dirname(stableBin), { recursive: true });
  await symlink(executableTarget, stableBin);

  await installProviderHooks({
    provider: "claude",
    homeDirectory: home,
    executablePath: stableBin,
  });

  const installed = JSON.parse(await readFile(configPath(home, "claude"), "utf8"));
  const commands = Object.values(installed.hooks)
    .flatMap((groups) => groups as Array<{ hooks: Array<{ command: string }> }>)
    .flatMap((group) => group.hooks)
    .map((hook) => hook.command);
  assert.ok(commands.every((command) => command.includes(stableBin)));
  assert.ok(commands.every((command) => !command.includes(executableTarget)));
});

test("replaces and uninstalls pre-rename managed hooks", async (context) => {
  const home = await fixtureHome(context);
  const executablePath = await executableFixture(home);
  const targetPath = configPath(home, "claude");
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(
    targetPath,
    `${JSON.stringify({
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command:
                  "SIGNAL_MANAGED_HOOK=1 '/legacy/bin/signal' hook --provider claude --json",
              },
              { type: "command", command: "/usr/bin/user-hook" },
            ],
          },
        ],
      },
    }, null, 2)}\n`,
    { mode: 0o600 },
  );

  await installProviderHooks({
    provider: "claude",
    homeDirectory: home,
    executablePath,
  });
  const installed = await readFile(targetPath, "utf8");
  assert.doesNotMatch(installed, /SIGNAL_MANAGED_HOOK=1/u);
  assert.match(installed, /SIDE_GLANCE_MANAGED_HOOK=1/u);
  assert.match(installed, /\/usr\/bin\/user-hook/u);

  await uninstallProviderHooks({
    provider: "claude",
    homeDirectory: home,
    executablePath,
  });
  const uninstalled = await readFile(targetPath, "utf8");
  assert.doesNotMatch(uninstalled, /(?:SIGNAL|SIDE_GLANCE)_MANAGED_HOOK=1/u);
  assert.match(uninstalled, /\/usr\/bin\/user-hook/u);
});
