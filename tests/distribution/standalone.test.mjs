import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const npmExecutable = path.join(
  path.dirname(process.execPath),
  process.platform === "win32" ? "npm.cmd" : "npm",
);

test("builds a versioned standalone archive that runs without Node on PATH", async () => {
  await command(npmExecutable, ["run", "build:standalone"], {
    cwd: repository,
    env: {
      ...process.env,
      NPM_CONFIG_CACHE: path.join(repository, "work/npm-cache"),
      PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
    },
  });

  const target = platformTarget();
  const version = "0.1.0-beta.1";
  const executable = path.join(repository, "work/release/signal");
  const strippedEnvironment = {
    ...process.env,
    PATH: "/usr/bin:/bin",
    SIGNAL_STATE_DIR: path.join(repository, "work/standalone-state"),
  };
  const versionResult = await command(executable, ["--version"], {
    cwd: repository,
    env: strippedEnvironment,
  });
  assert.equal(versionResult.stdout.trim(), version);
  const preview = await command(
    executable,
    ["preview", "--phase", "waiting", "--elapsed", "60", "--json"],
    { cwd: repository, env: strippedEnvironment },
  );
  assert.equal(JSON.parse(preview.stdout).urgency, 500);

  const archiveName = `terminal-signal-v${version}-${target}.tar.gz`;
  const archive = path.join(repository, "outputs", archiveName);
  const listing = await command("/usr/bin/tar", ["-tzf", archive], {
    cwd: repository,
    env: process.env,
  });
  assert.deepEqual(listing.stdout.trim().split("\n").sort(), [
    "LICENSE",
    "LICENSES/node.txt",
    "README.md",
    "VERSION",
    "signal",
  ]);
  assert.equal((await readFile(path.join(repository, "outputs/SHA256SUMS"), "utf8")).trim().split(/\s+/u).at(-1), archiveName);
});

function platformTarget() {
  if (process.platform === "darwin" && process.arch === "arm64") return "darwin-arm64";
  if (process.platform === "darwin" && process.arch === "x64") return "darwin-x64.experimental";
  if (process.platform === "linux" && process.arch === "arm64") return "linux-arm64-gnu";
  if (process.platform === "linux" && process.arch === "x64") return "linux-x64-gnu";
  throw new Error(`Unsupported standalone target: ${process.platform}-${process.arch}`);
}

function command(executable, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
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
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`${executable} failed (${signal ?? code}):\n${stderr || stdout}`));
    });
  });
}
