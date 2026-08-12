import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  installProviderHooks,
  uninstallProviderHooks,
  type InstallableProvider,
} from "../../src/adapters/installers.ts";

async function fixtureHome(context: test.TestContext): Promise<string> {
  const home = await mkdtemp(path.join(tmpdir(), "signal-installer-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  return home;
}

async function executableFixture(home: string): Promise<string> {
  const executable = path.join(home, "bin", "signal executable");
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
      name.includes(".signal-backup-"),
    );
    assert.equal(backups.length, 1);
  }
});

test("uninstall removes only Signal-owned handlers and preserves Codex notify", async (context) => {
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
