import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const builder = path.join(repository, "scripts/release/build-standalone.mjs");

test("builds and smokes the exact versioned standalone archive without Node on PATH", async (context) => {
  const target = platformTarget();
  await command(process.execPath, [builder], {
    cwd: repository,
    env: {
      ...process.env,
      NPM_CONFIG_CACHE: path.join(repository, "work/npm-cache"),
      PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
      SIGNAL_RELEASE_TARGET: target,
    },
  });

  const { version } = JSON.parse(
    await readFile(path.join(repository, "packages/cli/package.json"), "utf8"),
  );
  const archiveName = `terminal-signal-v${version}-${target}.tar.gz`;
  const archive = path.join(repository, "outputs", archiveName);
  const archiveBytes = await readFile(archive);
  const digest = createHash("sha256").update(archiveBytes).digest("hex");
  const metadata = JSON.parse(
    await readFile(path.join(repository, "outputs", `${archiveName}.artifact.json`), "utf8"),
  );
  assert.deepEqual(metadata, {
    schemaVersion: 1,
    version,
    target,
    filename: archiveName,
    sha256: digest,
    size: archiveBytes.byteLength,
  });

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

  const extracted = await mkdtemp(path.join(tmpdir(), "signal-standalone-extracted-"));
  context.after(() => rm(extracted, { recursive: true, force: true }));
  await command("/usr/bin/tar", ["-xzf", archive, "-C", extracted], {
    cwd: repository,
    env: process.env,
  });
  const executable = path.join(extracted, "signal");
  const strippedEnvironment = {
    ...process.env,
    PATH: "/usr/bin:/bin",
    SIGNAL_STATE_DIR: path.join(extracted, "state"),
  };
  const versionResult = await command(executable, ["--version"], {
    cwd: extracted,
    env: strippedEnvironment,
  });
  assert.equal(versionResult.stdout.trim(), version);
  const preview = await command(
    executable,
    ["preview", "--phase", "waiting", "--elapsed", "60", "--json"],
    { cwd: extracted, env: strippedEnvironment },
  );
  assert.equal(JSON.parse(preview.stdout).urgency, 500);
});

test("refuses to label a native build as a different release target", async () => {
  const wrongTarget = process.platform === "darwin" ? "linux-x64-gnu" : "darwin-arm64";
  await assert.rejects(
    () => command(process.execPath, [builder], {
      cwd: repository,
      env: {
        ...process.env,
        NPM_CONFIG_CACHE: path.join(repository, "work/npm-cache"),
        PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
        SIGNAL_RELEASE_TARGET: wrongTarget,
      },
    }),
    /does not match native runtime/iu,
  );
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
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`${executable} failed (${signal ?? code}):\n${stderr}${stdout}`));
    });
  });
}
