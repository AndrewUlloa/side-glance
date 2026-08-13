import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";

test("packs a minimal CLI and executes it from an isolated global prefix", async (context) => {
  const temporary = await mkdtemp(path.join(tmpdir(), "signal-npm-package-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const npmCache = path.join(temporary, "npm-cache");
  const npmEnvironment = { NPM_CONFIG_CACHE: npmCache };

  await command(npmExecutable, ["run", "build:cli"], {
    cwd: repository,
    env: npmEnvironment,
  });
  const packed = await command(
    npmExecutable,
    [
      "pack",
      "--workspace",
      "terminal-signal",
      "--json",
      "--pack-destination",
      temporary,
    ],
    { cwd: repository, env: npmEnvironment },
  );
  const [{ filename, files }] = JSON.parse(packed.stdout);
  assert.deepEqual(
    files.map(({ path: filePath }) => filePath).sort(),
    ["LICENSE", "README.md", "dist/signal.mjs", "package.json"],
  );

  const archive = path.join(temporary, filename);
  const prefix = path.join(temporary, "prefix");
  await command(
    npmExecutable,
    [
      "install",
      "--global",
      "--prefix",
      prefix,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      archive,
    ],
    { cwd: temporary, env: npmEnvironment },
  );

  const executable = path.join(
    prefix,
    process.platform === "win32" ? "signal.cmd" : "bin/signal",
  );
  const stateDirectory = path.join(temporary, "state");
  const doctor = await command(executable, ["doctor", "--home", temporary, "--json"], {
    cwd: temporary,
    env: {
      SIGNAL_STATE_DIR: stateDirectory,
      PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
    },
  });
  const report = JSON.parse(doctor.stdout);
  assert.equal(report.node.supported, true);
  assert.equal(report.stateDirectory, stateDirectory);
  const installedHome = path.join(temporary, "installed-home");
  const runtimeEnvironment = {
    SIGNAL_STATE_DIR: stateDirectory,
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  await command(
    executable,
    ["install", "claude", "--home", installedHome, "--json"],
    { cwd: temporary, env: runtimeEnvironment },
  );
  const settingsPath = path.join(installedHome, ".claude", "settings.json");
  const installedSettings = JSON.parse(await readFile(settingsPath, "utf8"));
  const hookCommand = installedSettings.hooks.SessionStart[0].hooks[0].command;
  assert.match(hookCommand, new RegExp(escapeRegularExpression(executable), "u"));
  const hookPayload = JSON.stringify({
    hook_event_name: "SessionStart",
    session_id: "packaged-hook-session",
  });
  const firstHook = await command("/bin/sh", ["-c", hookCommand], {
    cwd: temporary,
    env: { ...runtimeEnvironment, SIGNAL_SURFACE_ID: "test:packaged-hook" },
    input: hookPayload,
  });
  assert.equal(
    JSON.parse(firstHook.stdout).sessions["claude:packaged-hook-session"].phase,
    "working",
  );

  await command(
    npmExecutable,
    [
      "install",
      "--global",
      "--prefix",
      prefix,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      archive,
    ],
    { cwd: temporary, env: npmEnvironment },
  );
  const hookAfterReinstall = await command("/bin/sh", ["-c", hookCommand], {
    cwd: temporary,
    env: { ...runtimeEnvironment, SIGNAL_SURFACE_ID: "test:packaged-hook" },
    input: JSON.stringify({
      hook_event_name: "SessionEnd",
      session_id: "packaged-hook-session",
      reason: "reinstalled",
    }),
  });
  assert.equal(
    JSON.parse(hookAfterReinstall.stdout).sessions["claude:packaged-hook-session"].phase,
    "inactive",
  );
  const version = await command(executable, ["--version"], {
    cwd: temporary,
    env: { PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}` },
  });
  assert.equal(version.stdout.trim(), "0.1.0-beta.1");
  const help = await command(executable, ["--help"], {
    cwd: temporary,
    env: { PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}` },
  });
  assert.match(help.stdout, /signal install <claude\|codex\|gemini>/u);

  const manifest = JSON.parse(
    await readFile(path.join(prefix, "lib/node_modules/terminal-signal/package.json"), "utf8"),
  );
  assert.deepEqual(manifest.dependencies ?? {}, {});
  assert.equal(manifest.private, undefined);
  assert.deepEqual(manifest.bin, {
    signal: "dist/signal.mjs",
    "terminal-signal": "dist/signal.mjs",
  });

  const npxVersion = await command(
    npmExecutable,
    [
      "exec",
      "--yes",
      "--offline",
      "--package",
      archive,
      "--",
      "terminal-signal",
      "--version",
    ],
    {
      cwd: temporary,
      env: {
        ...npmEnvironment,
        PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
      },
    },
  );
  assert.equal(npxVersion.stdout.trim(), "0.1.0-beta.1");

  const npxHome = path.join(temporary, "npx-home");
  await assert.rejects(
    () =>
      command(
        npmExecutable,
        [
          "exec",
          "--yes",
          "--offline",
          "--package",
          archive,
          "--",
          "terminal-signal",
          "install",
          "claude",
          "--home",
          npxHome,
          "--json",
        ],
        {
          cwd: temporary,
          env: {
            ...npmEnvironment,
            PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
          },
        },
      ),
    /Permanent provider hooks cannot be installed from npx/u,
  );
  await assert.rejects(
    () => readFile(path.join(npxHome, ".claude", "settings.json"), "utf8"),
    /ENOENT/u,
  );
});

function command(executable, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    if (options.input !== undefined) child.stdin.end(options.input);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `${executable} ${args.join(" ")} failed (${signal ?? code}):\n${stderr || stdout}`,
        ),
      );
    });
  });
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
