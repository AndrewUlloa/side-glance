import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyFreshTabsPlan,
  inspectFreshTabs,
  planFreshTabs,
  removeFreshTabs,
  verifyFreshTabsApplication,
} from "../../src/adapters/fresh-tabs.ts";

test("installs one reversible zsh startup reset without changing unrelated configuration", async (context) => {
  const homeDirectory = await fixtureHome(context);
  const zshrc = path.join(homeDirectory, ".zshrc");
  const original = "export EDITOR=vim\n\n# user aliases\nalias ll='ls -la'\n";
  await writeFile(zshrc, original, { mode: 0o640 });

  const before = await inspectFreshTabs({
    homeDirectory,
    environment: { SHELL: "/bin/zsh" },
  });
  assert.deepEqual(before, {
    state: "eligible",
    shell: "zsh",
    integrationStatus: "not-installed",
    target: { path: zshrc, action: "update" },
  });

  const plan = await planFreshTabs({
    homeDirectory,
    environment: { SHELL: "/bin/zsh" },
    enabled: true,
  });
  const application = await applyFreshTabsPlan(plan);
  await verifyFreshTabsApplication(application);

  const installed = await readFile(zshrc, "utf8");
  assert.ok(installed.startsWith(original));
  assert.equal(installed.match(/Side Glance fresh terminal tabs/gu)?.length, 2);
  assert.match(installed, /\$\{SHLVL:-0\} -le 1/u);
  assert.match(installed, /-z \$\{TMUX-\}/u);
  assert.match(installed, /-z \$\{SSH_CONNECTION-\}/u);
  assert.match(installed, /builtin printf '\\e\]111\\e\\\\'/u);
  assert.equal((await statMode(zshrc)) & 0o777, 0o640);

  const second = await planFreshTabs({
    homeDirectory,
    environment: { SHELL: "/bin/zsh" },
    enabled: true,
  });
  assert.equal(second.action, "unchanged");
  assert.equal(second.changed, false);
});

test("uninstall removes only the exact managed block and is idempotent", async (context) => {
  const homeDirectory = await fixtureHome(context);
  const zshrc = path.join(homeDirectory, ".zshrc");
  const original = "export KEEP_ME=1\n";
  await writeFile(zshrc, original);

  const installedPlan = await planFreshTabs({
    homeDirectory,
    environment: { SHELL: "/bin/zsh" },
    enabled: true,
  });
  await applyFreshTabsPlan(installedPlan);

  const removed = await removeFreshTabs({
    homeDirectory,
    environment: { SHELL: "/bin/zsh" },
  });
  assert.equal(removed.changed, true);
  assert.equal(await readFile(zshrc, "utf8"), original);

  const again = await removeFreshTabs({
    homeDirectory,
    environment: { SHELL: "/bin/zsh" },
  });
  assert.equal(again.changed, false);
  assert.equal(await readFile(zshrc, "utf8"), original);
});

test("disabling an absent integration does not create a shell startup file", async (context) => {
  const homeDirectory = await fixtureHome(context);
  const removed = await removeFreshTabs({
    homeDirectory,
    environment: { SHELL: "/bin/fish" },
  });
  assert.equal(removed.changed, false);
  await assert.rejects(
    () => readFile(path.join(homeDirectory, ".zshrc"), "utf8"),
    /ENOENT/u,
  );
});

test(
  "a top-level local zsh emits only the owned reset while tmux and nesting stay silent",
  { skip: process.platform !== "darwin" },
  async (context) => {
    const homeDirectory = await fixtureHome(context);
    await applyFreshTabsPlan(
      await planFreshTabs({
        homeDirectory,
        environment: { SHELL: "/bin/zsh" },
        enabled: true,
      }),
    );
    const runner = path.join(homeDirectory, "run-zsh");
    await writeFile(
      runner,
      `#!/bin/zsh -f\nsource "${homeDirectory}/.zshrc"\n`,
      { mode: 0o700 },
    );
    await chmod(runner, 0o700);

    const direct = await runExpectZsh(homeDirectory, runner, {
      SHLVL: "0",
    });
    assert.equal(direct.includes(Buffer.from("\u001b]111\u001b\\")), true);

    const tmux = await runExpectZsh(homeDirectory, runner, {
      SHLVL: "0",
      TMUX: "/tmp/fake-tmux",
    });
    assert.equal(tmux.includes(Buffer.from("\u001b]111\u001b\\")), false);

    const nested = await runExpectZsh(homeDirectory, runner, {
      SHLVL: "1",
    });
    assert.equal(nested.includes(Buffer.from("\u001b]111\u001b\\")), false);

    const ssh = await runExpectZsh(homeDirectory, runner, {
      SHLVL: "0",
      SSH_CONNECTION: "192.0.2.1 1234 192.0.2.2 22",
    });
    assert.equal(ssh.includes(Buffer.from("\u001b]111\u001b\\")), false);

    const redirected = await runZshWithoutTty(homeDirectory, runner);
    assert.equal(redirected.includes(Buffer.from("\u001b]111\u001b\\")), false);
  },
);

test("fails closed for unsupported shells, malformed ownership markers, and symlink targets", async (context) => {
  const homeDirectory = await fixtureHome(context);
  assert.deepEqual(
    await inspectFreshTabs({
      homeDirectory,
      environment: { SHELL: "/bin/fish" },
    }),
    {
      state: "unavailable",
      shell: null,
      integrationStatus: "unknown",
      reason: "unsupported-shell",
    },
  );
  await assert.rejects(
    () =>
      planFreshTabs({
        homeDirectory,
        environment: { SHELL: "/bin/fish" },
        enabled: true,
      }),
    /supported zsh/u,
  );

  const zshrc = path.join(homeDirectory, ".zshrc");
  await writeFile(zshrc, "# >>> Side Glance fresh terminal tabs >>>\nuser code\n");
  assert.equal(
    (
      await inspectFreshTabs({
        homeDirectory,
        environment: { SHELL: "/bin/zsh" },
      })
    ).state,
    "blocked",
  );
  await assert.rejects(
    () =>
      planFreshTabs({
        homeDirectory,
        environment: { SHELL: "/bin/zsh" },
        enabled: true,
      }),
    /ownership markers/u,
  );

  const other = path.join(homeDirectory, "other-zshrc");
  await writeFile(other, "export PRIVATE=1\n");
  await writeFile(zshrc, "");
  await symlink(other, path.join(homeDirectory, "linked-zshrc"));
  await assert.rejects(
    () =>
      planFreshTabs({
        homeDirectory,
        environment: { SHELL: "/bin/zsh", ZDOTDIR: homeDirectory },
        enabled: true,
        configPath: path.join(homeDirectory, "linked-zshrc"),
      }),
    /symbolic link/u,
  );
});

async function fixtureHome(context: test.TestContext): Promise<string> {
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "side-glance-tabs-"));
  context.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(homeDirectory, { recursive: true, force: true });
  });
  await mkdir(homeDirectory, { recursive: true });
  return homeDirectory;
}

async function statMode(filePath: string): Promise<number> {
  const { stat } = await import("node:fs/promises");
  return (await stat(filePath)).mode;
}

async function runExpectZsh(
  homeDirectory: string,
  runner: string,
  environment: Readonly<Record<string, string>>,
): Promise<Buffer> {
  const expectScript = path.join(
    homeDirectory,
    `fresh-tabs-${environment.TMUX ? "tmux" : environment.SSH_CONNECTION ? "ssh" : environment.SHLVL === "1" ? "nested" : "direct"}.exp`,
  );
  const environmentLines = [
    "catch {unset env(TMUX)}",
    "catch {unset env(SSH_CONNECTION)}",
    "catch {unset env(SSH_TTY)}",
    ...Object.entries(environment).map(
      ([key, value]) => `set env(${key}) {${value.replaceAll("}", "\\}")}}`,
    ),
  ];
  await writeFile(
    expectScript,
    `#!/usr/bin/expect -f\nset timeout 5\n${environmentLines.join("\n")}\nspawn /bin/zsh -f -i [lindex $argv 0]\nexpect eof\n`,
    { mode: 0o700 },
  );
  return await new Promise<Buffer>((resolve, reject) => {
    const child = spawn("/usr/bin/expect", [expectScript, runner], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`expect exited ${code}: ${Buffer.concat(chunks).toString("utf8")}`));
    });
  });
}

async function runZshWithoutTty(
  homeDirectory: string,
  runner: string,
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const child = spawn("/bin/zsh", ["-f", "-i", runner], {
      env: {
        NODE_ENV: "test",
        HOME: homeDirectory,
        PATH: "/usr/bin:/bin",
        SHELL: "/bin/zsh",
        SHLVL: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`zsh exited ${code}`));
    });
  });
}
