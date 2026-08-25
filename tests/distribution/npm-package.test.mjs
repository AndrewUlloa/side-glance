import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const packageVersion = JSON.parse(
  await readFile(path.join(repository, "packages/cli/package.json"), "utf8"),
).version;

test("packs Side Glance as a minimal CLI and executes it from an isolated global prefix", async (context) => {
  const temporary = await mkdtemp(path.join(tmpdir(), "side-glance-npm-package-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const npmCache = path.join(temporary, "npm-cache");
  const npmEnvironment = {
    NPM_CONFIG_CACHE: npmCache,
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
  };

  await rm(path.join(repository, "packages/cli/dist"), { recursive: true, force: true });
  const packed = await command(
    npmExecutable,
    [
      "pack",
      "--workspace",
      "side-glance",
      "--json",
      "--pack-destination",
      temporary,
    ],
    { cwd: repository, env: npmEnvironment },
  );
  const [{ filename, files }] = JSON.parse(packed.stdout);
  assert.deepEqual(
    files.map(({ path: filePath }) => filePath).sort(),
    ["LICENSE", "README.md", "dist/side-glance.mjs", "package.json"],
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
    process.platform === "win32" ? "side-glance.cmd" : "bin/side-glance",
  );
  const stateDirectory = path.join(temporary, "state");
  const doctor = await command(executable, ["doctor", "--home", temporary, "--json"], {
    cwd: temporary,
    env: {
      SIDE_GLANCE_STATE_DIR: stateDirectory,
      PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
    },
  });
  const report = JSON.parse(doctor.stdout);
  assert.equal(report.node.supported, true);
  assert.equal(report.stateDirectory, stateDirectory);
  const installedHome = path.join(temporary, "installed-home");
  await mkdir(installedHome, { recursive: true });
  const runtimeEnvironment = {
    SIDE_GLANCE_STATE_DIR: stateDirectory,
    SIDE_GLANCE_NOTIFICATION_BACKEND: "none",
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  await command(
    executable,
    [
      "install",
      "claude",
      "--home",
      installedHome,
      "--notifications",
      "--notification-sound",
      "Glass",
      "--json",
    ],
    { cwd: temporary, env: runtimeEnvironment },
  );
  const settingsPath = path.join(installedHome, ".claude", "settings.json");
  const installedSettings = JSON.parse(await readFile(settingsPath, "utf8"));
  const hookCommand = installedSettings.hooks.SessionStart[0].hooks[0].command;
  assert.match(hookCommand, new RegExp(escapeRegularExpression(executable), "u"));
  assert.match(hookCommand, /--notifications --notification-sound 'Glass'/u);
  const hookPayload = JSON.stringify({
    hook_event_name: "SessionStart",
    session_id: "packaged-hook-session",
  });
  const firstHook = await command("/bin/sh", ["-c", hookCommand], {
    cwd: temporary,
    env: { ...runtimeEnvironment, SIDE_GLANCE_SURFACE_ID: "test:packaged-hook" },
    input: hookPayload,
  });
  assert.equal(firstHook.stdout, "");
  const workingStatus = await command(executable, ["status", "--json"], {
    cwd: temporary,
    env: runtimeEnvironment,
  });
  assert.equal(
    JSON.parse(workingStatus.stdout).sessions["claude:packaged-hook-session"].phase,
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
    env: { ...runtimeEnvironment, SIDE_GLANCE_SURFACE_ID: "test:packaged-hook" },
    input: JSON.stringify({
      hook_event_name: "SessionEnd",
      session_id: "packaged-hook-session",
      reason: "reinstalled",
    }),
  });
  assert.equal(hookAfterReinstall.stdout, "");
  const inactiveStatus = await command(executable, ["status", "--json"], {
    cwd: temporary,
    env: runtimeEnvironment,
  });
  assert.equal(
    JSON.parse(inactiveStatus.stdout).sessions["claude:packaged-hook-session"].phase,
    "inactive",
  );
  const version = await command(executable, ["--version"], {
    cwd: temporary,
    env: { PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}` },
  });
  assert.equal(version.stdout.trim(), packageVersion);
  const help = await command(executable, ["--help"], {
    cwd: temporary,
    env: { PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}` },
  });
  assert.match(
    help.stdout,
    /side-glance install <claude\|codex\|gemini\|opencode>/u,
  );
  assert.match(help.stdout, /side-glance init/u);
  assert.match(help.stdout, /side-glance setup/u);

  const setupHome = path.join(temporary, "guided-setup-home");
  await mkdir(setupHome, { recursive: true });
  const providerBin = path.join(temporary, "provider-bin");
  await mkdir(providerBin, { recursive: true });
  const claudeExecutable = path.join(providerBin, "claude");
  await writeFile(claudeExecutable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  const setupPreview = await command(
    executable,
    [
      "setup",
      "--dry-run",
      "--providers",
      "claude",
      "--notifications",
      "none",
      "--home",
      setupHome,
      "--json",
    ],
    {
      cwd: temporary,
      env: {
        ...runtimeEnvironment,
        PATH: `${providerBin}${path.delimiter}${runtimeEnvironment.PATH}`,
      },
    },
  );
  assert.equal(JSON.parse(setupPreview.stdout).kind, "setup-plan");
  await assert.rejects(
    () => readFile(path.join(setupHome, ".claude", "settings.json"), "utf8"),
    /ENOENT/u,
  );
  const notified = await command(
    executable,
    [
      "notify",
      "--source",
      "aider",
      "--session",
      "packaged-aider-session",
      "--kind",
      "completed",
      "--json",
    ],
    { cwd: temporary, env: runtimeEnvironment },
  );
  assert.equal(notified.stdout, "{}\n");
  const notifiedStatus = await command(executable, ["status", "--json"], {
    cwd: temporary,
    env: runtimeEnvironment,
  });
  assert.equal(
    JSON.parse(notifiedStatus.stdout).sessions["aider:packaged-aider-session"]
      .phase,
    "completed",
  );

  const manifest = JSON.parse(
    await readFile(path.join(prefix, "lib/node_modules/side-glance/package.json"), "utf8"),
  );
  assert.deepEqual(manifest.dependencies ?? {}, {});
  assert.equal(manifest.license, "Apache-2.0");
  assert.equal(manifest.publishConfig.tag, packageVersion.includes("-") ? "beta" : "latest");
  assert.equal(manifest.private, undefined);
  assert.equal(
    await readFile(path.join(prefix, "lib/node_modules/side-glance/LICENSE"), "utf8"),
    await readFile(path.join(repository, "LICENSE"), "utf8"),
  );
  assert.deepEqual(manifest.bin, {
    "side-glance": "dist/side-glance.mjs",
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
      "side-glance",
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
  assert.equal(npxVersion.stdout.trim(), packageVersion);
  const npxHelp = await command(
    npmExecutable,
    [
      "exec",
      "--yes",
      "--offline",
      "--package",
      archive,
      "--",
      "side-glance",
      "init",
      "--help",
    ],
    {
      cwd: temporary,
      env: {
        ...npmEnvironment,
        PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
      },
    },
  );
  assert.match(npxHelp.stdout, /--install <homebrew\|npm\|none>/u);

  const npxHome = path.join(temporary, "npx-home");
  await mkdir(npxHome, { recursive: true });
  const npxBootstrap = await command(
    npmExecutable,
    [
      "exec",
      "--yes",
      "--offline",
      "--package",
      archive,
      "--",
      "side-glance",
      "init",
      "--install",
      "none",
      "--providers",
      "claude",
      "--notifications",
      "none",
      "--home",
      npxHome,
      "--dry-run",
      "--json",
    ],
    {
      cwd: temporary,
      env: {
        ...npmEnvironment,
        PATH: `${providerBin}${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}/usr/bin${path.delimiter}/bin`,
      },
    },
  );
  const bootstrapPlan = JSON.parse(npxBootstrap.stdout);
  assert.equal(bootstrapPlan.kind, "bootstrap-plan");
  assert.equal(bootstrapPlan.durableExecutable.status, "pending");
  assert.equal(bootstrapPlan.providerActions[0].action, "deferred");
  assert.equal(bootstrapPlan.launchCommands, "deferred");

  const fakeManagerBin = path.join(temporary, "fake-manager-bin");
  const durableBin = path.join(temporary, "durable-bin");
  const fakeNpm = path.join(fakeManagerBin, "npm");
  const durableExecutable = path.join(durableBin, "side-glance");
  const installerArguments = path.join(temporary, "fake-npm-arguments.txt");
  await mkdir(fakeManagerBin, { recursive: true });
  await mkdir(durableBin, { recursive: true });
  await writeFile(
    fakeNpm,
    `#!/bin/sh
printf '%s\n' "$@" > ${shellQuote(installerArguments)}
/bin/cp ${shellQuote(executable)} ${shellQuote(durableExecutable)}
/bin/chmod 700 ${shellQuote(durableExecutable)}
`,
    { mode: 0o700 },
  );
  const bootstrapHome = path.join(temporary, "bootstrap-apply-home");
  await mkdir(bootstrapHome, { recursive: true });
  const installedBootstrap = await command(
    executable,
    [
      "init",
      "--install",
      "npm",
      "--providers",
      "claude",
      "--notifications",
      "none",
      "--home",
      bootstrapHome,
      "--yes",
      "--json",
    ],
    {
      cwd: temporary,
      env: {
        ...npmEnvironment,
        npm_command: "exec",
        npm_lifecycle_event: "npx",
        PATH: [
          fakeManagerBin,
          durableBin,
          providerBin,
          path.dirname(process.execPath),
          "/usr/bin",
          "/bin",
        ].join(path.delimiter),
      },
    },
  );
  const installedBootstrapResult = JSON.parse(installedBootstrap.stdout);
  assert.equal(installedBootstrapResult.kind, "bootstrap-result");
  assert.equal(installedBootstrapResult.packageInstalled, true);
  assert.equal(installedBootstrapResult.setupApplied, true);
  assert.deepEqual(
    (await readFile(installerArguments, "utf8")).trim().split("\n"),
    [
      "install",
      "--global",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      `side-glance@${packageVersion}`,
    ],
  );
  const bootstrappedSettings = await readFile(
    path.join(bootstrapHome, ".claude", "settings.json"),
    "utf8",
  );
  assert.match(
    bootstrappedSettings,
    new RegExp(escapeRegularExpression(durableExecutable), "u"),
  );
  assert.doesNotMatch(bootstrappedSettings, /(?:^|[/\\])_npx(?:[/\\]|$)/u);

  const exactHandoff = await command(
    npmExecutable,
    [
      "exec",
      "--yes",
      "--offline",
      "--package",
      archive,
      "--",
      "side-glance",
      "init",
      "--providers",
      "claude",
      "--notifications",
      "none",
      "--home",
      bootstrapHome,
      "--dry-run",
      "--json",
    ],
    {
      cwd: temporary,
      env: {
        ...npmEnvironment,
        PATH: [
          path.dirname(process.execPath),
          durableBin,
          providerBin,
          "/usr/bin",
          "/bin",
        ].join(path.delimiter),
      },
    },
  );
  assert.equal(JSON.parse(exactHandoff.stdout).kind, "setup-plan");
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
          "side-glance",
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

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
