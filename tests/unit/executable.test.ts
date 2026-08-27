import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  captureExecutableIdentity,
  detectEphemeralNpmExecution,
  findDurableExecutableOnPath,
  revalidateExecutableIdentity,
  resolveExecutableInvocationPath,
  sanitizeDelegatedEnvironment,
  validateDurableExecutable,
  type ExecutableFileSystem,
  type ExecutableMetadata,
  type VersionProbe,
} from "../../src/cli/executable.ts";

const EXPECTED_VERSION = "0.1.0-beta.8";

async function fixtureDirectory(context: test.TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "side-glance-executable-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function executableFile(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "#!/bin/sh\nexit 0\n");
  await chmod(filePath, 0o755);
}

function successfulProbe(
  calls: Array<{
    executablePath: string;
    args: readonly string[];
    timeoutMs: number;
    maxOutputBytes: number;
  }> = [],
): VersionProbe {
  return async (executablePath, args, bounds) => {
    calls.push({ executablePath, args, ...bounds });
    return {
      exitCode: 0,
      stdout: `${EXPECTED_VERSION}\n`,
    };
  };
}

test("detects npm exec from environment, _npx paths, and configured cache paths", () => {
  assert.equal(
    detectEphemeralNpmExecution({
      environment: { npm_lifecycle_event: "npx" },
      invocationPath: "/usr/local/bin/side-glance",
    }),
    true,
  );
  assert.equal(
    detectEphemeralNpmExecution({
      environment: { npm_command: "exec" },
      invocationPath: "/usr/local/bin/side-glance",
    }),
    true,
  );
  assert.equal(
    detectEphemeralNpmExecution({
      environment: {},
      invocationPath: "/Users/test/.npm/_npx/abc/node_modules/.bin/side-glance",
    }),
    true,
  );
  assert.equal(
    detectEphemeralNpmExecution({
      environment: { npm_config_cache: "/private/cache/npm" },
      invocationPath: "/private/cache/npm/content/side-glance",
    }),
    true,
  );
  assert.equal(
    detectEphemeralNpmExecution({
      environment: { NPM_CONFIG_CACHE: "/private/cache/npm" },
      invocationPath: "/opt/homebrew/bin/side-glance",
      realPath: "/private/cache/npm/content/side-glance",
    }),
    true,
  );
  assert.equal(
    detectEphemeralNpmExecution({
      environment: { npm_command: "install" },
      invocationPath: "/opt/homebrew/bin/side-glance",
      realPath: "/opt/homebrew/Cellar/side-glance/0.1.0/bin/side-glance",
    }),
    false,
  );
});

test("validates an exact-version regular executable while preserving its stable invocation path", async (context) => {
  const directory = await fixtureDirectory(context);
  const target = path.join(directory, "Cellar", "side-glance", EXPECTED_VERSION);
  const stable = path.join(directory, "bin", "side-glance");
  await executableFile(target);
  await mkdir(path.dirname(stable), { recursive: true });
  await symlink(target, stable);
  const calls: Array<{
    executablePath: string;
    args: readonly string[];
    timeoutMs: number;
    maxOutputBytes: number;
  }> = [];

  const validated = await validateDurableExecutable({
    invocationPath: stable,
    expectedVersion: EXPECTED_VERSION,
    environment: { PATH: path.dirname(stable) },
    probeVersion: successfulProbe(calls),
  });

  assert.equal(validated.invocationPath, stable);
  assert.equal(validated.realPath, await realpath(target));
  assert.equal(validated.version, EXPECTED_VERSION);
  assert.equal(validated.identity.invocationPath, stable);
  assert.equal(validated.identity.realPath, await realpath(target));
  assert.deepEqual(calls, [
    {
      executablePath: stable,
      args: ["--version"],
      timeoutMs: 2_000,
      maxOutputBytes: 256,
    },
  ]);
  await revalidateExecutableIdentity(validated);
});

test("recovers a stable PATH invocation that identifies the running executable", async (context) => {
  const directory = await fixtureDirectory(context);
  const target = path.join(directory, "Cellar", "side-glance", EXPECTED_VERSION, "bin", "side-glance");
  const stable = path.join(directory, "bin", "side-glance");
  const shadow = path.join(directory, "shadow", "side-glance");
  await executableFile(target);
  await executableFile(shadow);
  await mkdir(path.dirname(stable), { recursive: true });
  await symlink(target, stable);

  const resolved = await resolveExecutableInvocationPath({
    reportedInvocationPath: "side-glance",
    processExecutablePath: target,
    environment: {
      PATH: [path.dirname(shadow), path.dirname(target), path.dirname(stable)].join(path.delimiter),
    },
  });

  assert.equal(resolved, stable);
});

test("does not fall back to an unrelated current-directory executable", async (context) => {
  const directory = await fixtureDirectory(context);
  const running = path.join(directory, "running", "side-glance");
  const decoy = path.join(directory, "side-glance");
  await executableFile(running);
  await executableFile(decoy);

  const resolved = await resolveExecutableInvocationPath({
    reportedInvocationPath: "side-glance",
    processExecutablePath: running,
    environment: { PATH: path.join(directory, "missing") },
    cwd: directory,
  });

  assert.equal(resolved, undefined);
});

test("rejects a PATH target whose full identity changed after runner capture", async () => {
  const running = "/cellar/side-glance";
  const stable = "/bin/side-glance";
  const original = executableMetadata(1);
  const changed = executableMetadata(2);
  let runningStats = 0;
  const fileSystem: ExecutableFileSystem = {
    access: async () => undefined,
    lstat: async (candidate) => candidate === stable ? symlinkMetadata() : original,
    realpath: async () => running,
    stat: async (candidate) => {
      if (candidate === stable) return changed;
      runningStats += 1;
      return runningStats <= 2 ? original : changed;
    },
  };

  const resolved = await resolveExecutableInvocationPath({
    reportedInvocationPath: "side-glance",
    processExecutablePath: running,
    environment: { PATH: "/bin" },
    fileSystem,
    cwd: "/work",
  });

  assert.equal(resolved, undefined);
});

function executableMetadata(seed: number): ExecutableMetadata {
  return {
    dev: 1,
    ino: 1,
    mode: 0o100755,
    size: seed,
    mtimeMs: seed,
    ctimeMs: seed,
    isFile: () => true,
    isSymbolicLink: () => false,
  };
}

function symlinkMetadata(): ExecutableMetadata {
  return {
    ...executableMetadata(1),
    mode: 0o120755,
    isSymbolicLink: () => true,
  };
}

test("rejects non-absolute, control-bearing, non-file, and non-executable candidates before probing", async (context) => {
  const directory = await fixtureDirectory(context);
  const regular = path.join(directory, "regular");
  await writeFile(regular, "not executable");
  let probes = 0;
  const probeVersion: VersionProbe = async () => {
    probes += 1;
    return { exitCode: 0, stdout: `${EXPECTED_VERSION}\n` };
  };

  await assert.rejects(
    validateDurableExecutable({
      invocationPath: "relative/side-glance",
      expectedVersion: EXPECTED_VERSION,
      environment: {},
      probeVersion,
    }),
    /absolute/i,
  );
  await assert.rejects(
    validateDurableExecutable({
      invocationPath: `${directory}/side-glance\nowned`,
      expectedVersion: EXPECTED_VERSION,
      environment: {},
      probeVersion,
    }),
    /control/i,
  );
  await assert.rejects(
    validateDurableExecutable({
      invocationPath: directory,
      expectedVersion: EXPECTED_VERSION,
      environment: {},
      probeVersion,
    }),
    /regular executable/i,
  );
  await assert.rejects(
    validateDurableExecutable({
      invocationPath: regular,
      expectedVersion: EXPECTED_VERSION,
      environment: {},
      probeVersion,
    }),
    /regular executable/i,
  );
  assert.equal(probes, 0);
});

test("rejects both lexical and resolved npm cache candidates", async (context) => {
  const directory = await fixtureDirectory(context);
  const cache = path.join(directory, "custom-npm-cache");
  const cached = path.join(cache, "content", "side-glance");
  const stableLooking = path.join(directory, "bin", "side-glance");
  await executableFile(cached);
  await mkdir(path.dirname(stableLooking), { recursive: true });
  await symlink(cached, stableLooking);

  await assert.rejects(
    validateDurableExecutable({
      invocationPath: cached,
      expectedVersion: EXPECTED_VERSION,
      environment: { npm_config_cache: cache },
      probeVersion: successfulProbe(),
    }),
    /temporary npm execution/i,
  );
  await assert.rejects(
    validateDurableExecutable({
      invocationPath: stableLooking,
      expectedVersion: EXPECTED_VERSION,
      environment: { npm_config_cache: cache },
      probeVersion: successfulProbe(),
    }),
    /temporary npm execution/i,
  );
});

test("PATH discovery scans past ephemeral shadows and the current runner identity", async (context) => {
  const directory = await fixtureDirectory(context);
  const cache = path.join(directory, "npm-cache");
  const ephemeral = path.join(cache, "_npx", "shadow", "side-glance");
  const runnerTarget = path.join(directory, "runner", "side-glance");
  const sameRunnerShadow = path.join(directory, "same-runner", "side-glance");
  const stable = path.join(directory, "stable", "side-glance");
  await executableFile(ephemeral);
  await executableFile(runnerTarget);
  await mkdir(path.dirname(sameRunnerShadow), { recursive: true });
  await symlink(runnerTarget, sameRunnerShadow);
  await executableFile(stable);
  const currentRunnerIdentity = await captureExecutableIdentity(runnerTarget);
  const probeCalls: string[] = [];

  const found = await findDurableExecutableOnPath({
    expectedVersion: EXPECTED_VERSION,
    environment: {
      PATH: [
        path.dirname(ephemeral),
        path.dirname(sameRunnerShadow),
        path.dirname(stable),
      ].join(path.delimiter),
      npm_config_cache: cache,
    },
    currentRunnerIdentity,
    probeVersion: async (executablePath) => {
      probeCalls.push(executablePath);
      return { exitCode: 0, stdout: `${EXPECTED_VERSION}\n` };
    },
  });

  assert.equal(found?.invocationPath, stable);
  assert.deepEqual(probeCalls, [stable]);
});

test("PATH discovery skips versioned Homebrew Cellar invocations for the stable bin link", async (context) => {
  const directory = await fixtureDirectory(context);
  const cellar = path.join(
    directory,
    "Cellar",
    "side-glance",
    EXPECTED_VERSION,
    "bin",
  );
  const versioned = path.join(cellar, "side-glance");
  const stable = path.join(directory, "bin", "side-glance");
  await executableFile(versioned);
  await mkdir(path.dirname(stable), { recursive: true });
  await symlink(versioned, stable);

  const found = await findDurableExecutableOnPath({
    expectedVersion: EXPECTED_VERSION,
    environment: {
      PATH: [cellar, path.dirname(stable)].join(path.delimiter),
    },
    probeVersion: successfulProbe(),
  });

  assert.equal(found?.invocationPath, stable);
  assert.equal(found?.realPath, await realpath(versioned));
});

test("version validation rejects every non-canonical result without reflecting hostile output", async (context) => {
  const directory = await fixtureDirectory(context);
  const candidate = path.join(directory, "side-glance");
  await executableFile(candidate);
  const hostile = "HOSTILE-PROBE-VALUE\u001b]11;owned\u0007";
  const cases: Array<{ name: string; probe: VersionProbe }> = [
    {
      name: "nonzero",
      probe: async () => ({ exitCode: 7, stdout: hostile }),
    },
    {
      name: "timeout",
      probe: async () => ({ exitCode: null, stdout: "", timedOut: true }),
    },
    {
      name: "oversized",
      probe: async () => ({
        exitCode: 0,
        stdout: "x".repeat(257),
      }),
    },
    {
      name: "wrong version",
      probe: async () => ({ exitCode: 0, stdout: "9.9.9\n" }),
    },
    {
      name: "extra line",
      probe: async () => ({
        exitCode: 0,
        stdout: `${EXPECTED_VERSION}\n${hostile}\n`,
      }),
    },
    {
      name: "probe exception",
      probe: async () => {
        throw new Error(hostile);
      },
    },
  ];

  for (const fixture of cases) {
    await assert.rejects(
      validateDurableExecutable({
        invocationPath: candidate,
        expectedVersion: EXPECTED_VERSION,
        environment: {},
        probeVersion: fixture.probe,
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error, fixture.name);
        assert.doesNotMatch(error.message, /HOSTILE|owned|9\.9\.9/u);
        assert.equal(
          [...error.message].some((character) => {
            const codePoint = character.codePointAt(0) ?? 0;
            return codePoint < 32 || codePoint === 127;
          }),
          false,
        );
        return true;
      },
    );
  }
});

test("the validator enforces the injected probe deadline", async (context) => {
  const directory = await fixtureDirectory(context);
  const candidate = path.join(directory, "side-glance");
  await executableFile(candidate);
  let outerTimeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await assert.rejects(
      Promise.race([
        validateDurableExecutable({
          invocationPath: candidate,
          expectedVersion: EXPECTED_VERSION,
          environment: {},
          probeTimeoutMs: 10,
          probeVersion: async () => new Promise(() => undefined),
        }),
        new Promise<never>((_resolve, reject) => {
          outerTimeout = setTimeout(
            () => reject(new Error("the validator did not enforce its deadline")),
            500,
          );
        }),
      ]),
      /version probe timed out/i,
    );
  } finally {
    if (outerTimeout) clearTimeout(outerTimeout);
  }
});

test("delegated environments remove npm-exec markers and ephemeral PATH entries", () => {
  const cache = "/private/cache/npm";
  const environment = sanitizeDelegatedEnvironment({
    PATH: [
      "/private/cache/npm/_npx/abc/node_modules/.bin",
      "/opt/homebrew/bin",
      "/tmp/_npx/shadow/bin",
      "/usr/bin",
    ].join(path.delimiter),
    npm_lifecycle_event: "npx",
    npm_lifecycle_script: "side-glance init",
    npm_command: "exec",
    npm_execpath: "/usr/local/lib/node_modules/npm/bin/npm-cli.js",
    npm_node_execpath: "/usr/local/bin/node",
    npm_config_cache: cache,
    SIDE_GLANCE_KEEP: "yes",
  });

  assert.equal(environment.PATH, ["/opt/homebrew/bin", "/usr/bin"].join(path.delimiter));
  assert.equal(environment.SIDE_GLANCE_KEEP, "yes");
  assert.equal(environment.npm_config_cache, cache);
  for (const key of [
    "npm_lifecycle_event",
    "npm_lifecycle_script",
    "npm_command",
    "npm_execpath",
    "npm_node_execpath",
  ]) {
    assert.equal(environment[key], undefined);
  }
});

test("identity revalidation rejects a replaced executable without exposing path contents", async (context) => {
  const directory = await fixtureDirectory(context);
  const candidate = path.join(directory, "sensitive-binary-name");
  const replacement = path.join(directory, "replacement");
  await executableFile(candidate);
  const validated = await validateDurableExecutable({
    invocationPath: candidate,
    expectedVersion: EXPECTED_VERSION,
    environment: {},
    probeVersion: successfulProbe(),
  });
  await executableFile(replacement);
  await rename(replacement, candidate);

  await assert.rejects(
    revalidateExecutableIdentity(validated),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /changed|identity/i);
      assert.doesNotMatch(error.message, /sensitive-binary-name/u);
      return true;
    },
  );
});
