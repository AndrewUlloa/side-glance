import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runInteractivePty } from "../helpers/interactive-pty.mjs";

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
      SIDE_GLANCE_RELEASE_TARGET: target,
    },
  });

  const { version } = JSON.parse(
    await readFile(path.join(repository, "packages/cli/package.json"), "utf8"),
  );
  const archiveName = `side-glance-v${version}-${target}.tar.gz`;
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
    "side-glance",
  ]);

  const extracted = await mkdtemp(path.join(tmpdir(), "side-glance-standalone-extracted-"));
  context.after(() => rm(extracted, { recursive: true, force: true }));
  await command("/usr/bin/tar", ["-xzf", archive, "-C", extracted], {
    cwd: repository,
    env: process.env,
  });
  assert.equal(
    await readFile(path.join(extracted, "LICENSE"), "utf8"),
    await readFile(path.join(repository, "LICENSE"), "utf8"),
  );
  const executable = path.join(extracted, "side-glance");
  const strippedEnvironment = {
    ...process.env,
    PATH: "/usr/bin:/bin",
    SIDE_GLANCE_STATE_DIR: path.join(extracted, "state"),
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
  assert.deepEqual(JSON.parse(preview.stdout), {
    phase: "waiting",
    urgency: 0,
    wash: "4d3510",
    accent: "f0a726",
  });
  const help = await command(executable, ["--help"], {
    cwd: extracted,
    env: strippedEnvironment,
  });
  assert.match(help.stdout, /side-glance init/u);
  assert.match(help.stdout, /side-glance setup/u);

  const setupHome = path.join(extracted, "guided-home");
  const providerBin = path.join(extracted, "provider-bin");
  await mkdir(setupHome, { recursive: true });
  await mkdir(providerBin, { recursive: true });
  const claude = path.join(providerBin, "claude");
  await writeFile(claude, "#!/bin/sh\nexit 0\n");
  await chmod(claude, 0o700);
  const arrowHome = path.join(extracted, "arrow-home");
  await mkdir(arrowHome, { recursive: true });
  const arrowSetup = await runInteractivePty({
    executable,
    arguments: ["init", "--home", arrowHome, "--executable", executable],
    cwd: extracted,
    environment: {
      ...strippedEnvironment,
      NO_COLOR: undefined,
      SIDE_GLANCE_ACCESSIBLE: undefined,
      TERM: "xterm-256color",
      PATH: `${providerBin}${path.delimiter}/usr/bin:/bin`,
    },
    interactions: [
      {
        prompt: "How would you like to continue?",
        answer: "\u001b[B\u001b[A\r",
      },
      { prompt: "Apply this setup plan? [Y/n] ", answer: "y\n" },
    ],
  });
  assert.match(arrowSetup.output, /↑\/↓ move/u);
  assert.match(arrowSetup.output, /Setup complete/u);
  assert.match(
    await readFile(path.join(arrowHome, ".claude", "settings.json"), "utf8"),
    new RegExp(escapeRegularExpression(executable), "u"),
  );
  const staticHome = path.join(extracted, "static-home");
  await mkdir(staticHome, { recursive: true });
  const staticSetup = await runInteractivePty({
    executable,
    arguments: ["init", "--home", staticHome, "--executable", executable],
    cwd: extracted,
    environment: {
      ...strippedEnvironment,
      NO_COLOR: "1",
      TERM: "xterm-256color",
      PATH: `${providerBin}${path.delimiter}/usr/bin:/bin`,
    },
    interactions: [
      {
        prompt: "Choose comma-separated numbers or names [default]: ",
        answer: "\n",
      },
      { prompt: "Apply this setup plan? [Y/n] ", answer: "y\n" },
    ],
  });
  assert.equal(staticSetup.output.includes(String.fromCodePoint(27)), false);
  assert.match(staticSetup.output, /Setup complete/u);
  const setup = await command(
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
      cwd: extracted,
      env: {
        ...strippedEnvironment,
        PATH: `${providerBin}${path.delimiter}/usr/bin:/bin`,
      },
    },
  );
  assert.equal(JSON.parse(setup.stdout).kind, "setup-plan");

  const applied = await command(
    executable,
    [
      "setup",
      "--providers",
      "claude",
      "--notifications",
      "none",
      "--home",
      setupHome,
      "--yes",
      "--json",
    ],
    {
      cwd: extracted,
      env: {
        ...strippedEnvironment,
        PATH: `${providerBin}${path.delimiter}/usr/bin:/bin`,
      },
    },
  );
  assert.equal(JSON.parse(applied.stdout).kind, "setup-result");
  const settings = await readFile(
    path.join(setupHome, ".claude", "settings.json"),
    "utf8",
  );
  assert.match(settings, new RegExp(escapeRegularExpression(executable), "u"));
  assert.doesNotMatch(settings, /(?:^|[/\\])_npx(?:[/\\]|$)/u);

  const homebrewRoot = path.join(extracted, "homebrew");
  const cellarExecutable = path.join(
    homebrewRoot, "Cellar", "side-glance", version, "bin", "side-glance",
  );
  const stableExecutable = path.join(homebrewRoot, "bin", "side-glance");
  const homebrewHome = path.join(extracted, "homebrew-home");
  await mkdir(path.dirname(cellarExecutable), { recursive: true });
  await mkdir(path.dirname(stableExecutable), { recursive: true });
  await mkdir(homebrewHome, { recursive: true });
  await copyFile(executable, cellarExecutable);
  await chmod(cellarExecutable, 0o755);
  await symlink(path.relative(path.dirname(stableExecutable), cellarExecutable), stableExecutable);
  const homebrewSetup = await command(
    "side-glance",
    ["init", "--dry-run", "--providers", "claude", "--notifications", "none", "--home", homebrewHome, "--json"],
    {
      cwd: homebrewHome,
      env: {
        ...strippedEnvironment,
        PATH: `${path.dirname(stableExecutable)}${path.delimiter}${providerBin}${path.delimiter}/usr/bin:/bin`,
      },
    },
  );
  assert.equal(JSON.parse(homebrewSetup.stdout).executablePath, stableExecutable);
});

test("refuses a different embedded Node release runtime", async () => {
  await assert.rejects(
    () => command(process.execPath, [builder], {
      cwd: repository,
      env: {
        ...process.env,
        SIDE_GLANCE_RELEASE_TARGET: platformTarget(),
        SIDE_GLANCE_RELEASE_NODE_VERSION: "0.0.0",
      },
    }),
    /Node runtime.*does not match pinned release runtime/iu,
  );
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
        SIDE_GLANCE_RELEASE_TARGET: wrongTarget,
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

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
