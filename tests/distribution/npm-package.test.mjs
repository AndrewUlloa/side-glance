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
});

function command(executable, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
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
