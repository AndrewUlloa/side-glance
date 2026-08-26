import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BootstrapError,
  buildHomebrewInstallArguments,
  buildNpmInstallArguments,
  classifyBootstrapTarget,
  createBootstrapPlan,
  executeBootstrap,
  resolvePackageManagerOnPath,
  type BootstrapCommandRequest,
  type BootstrapCommandResult,
  type BootstrapExecutionDependencies,
  type ResolvedPackageManager,
} from "../../src/cli/bootstrap.ts";
import type {
  ExecutableFileIdentity,
  ExecutableIdentityToken,
  FindDurableExecutableOptions,
  ValidatedDurableExecutable,
} from "../../src/cli/executable.ts";

const EXACT_VERSION = "0.1.0-beta.7";

function fileIdentity(seed: number): ExecutableFileIdentity {
  return {
    device: "1",
    inode: String(seed),
    mode: "33261",
    size: "100",
    modifiedAt: seed,
    changedAt: seed,
    kind: "file",
  };
}

function identityToken(
  invocationPath: string,
  realPath = invocationPath,
  seed = 1,
): ExecutableIdentityToken {
  return {
    invocationPath,
    realPath,
    invocation: fileIdentity(seed),
    target: fileIdentity(seed + 1),
  };
}

function durableExecutable(
  invocationPath: string,
  realPath = invocationPath,
): ValidatedDurableExecutable {
  return {
    invocationPath,
    realPath,
    version: EXACT_VERSION,
    identity: identityToken(invocationPath, realPath, 10),
  };
}

function packageManager(
  name: "brew" | "npm",
  invocationPath: string,
): ResolvedPackageManager {
  return {
    name,
    invocationPath,
    realPath: invocationPath,
    identity: identityToken(invocationPath, invocationPath, 20),
  };
}

function fixtureDependencies(options: {
  durableResults: readonly (ValidatedDurableExecutable | undefined)[];
  manager?: ResolvedPackageManager;
  commandResults?: readonly BootstrapCommandResult[];
  revalidateFailureAt?: number;
}) {
  const findCalls: FindDurableExecutableOptions[] = [];
  const resolveCalls: string[] = [];
  const revalidateCalls: ExecutableIdentityToken[] = [];
  const commandCalls: BootstrapCommandRequest[] = [];
  let findIndex = 0;
  let commandIndex = 0;
  const dependencies: BootstrapExecutionDependencies = {
    findDurableExecutable: async (request) => {
      findCalls.push(request);
      const result = options.durableResults[findIndex];
      findIndex += 1;
      return result;
    },
    resolvePackageManager: async (name) => {
      resolveCalls.push(name);
      return options.manager?.name === name ? options.manager : undefined;
    },
    revalidateExecutable: async (identity) => {
      revalidateCalls.push(identity);
      if (revalidateCalls.length === options.revalidateFailureAt) {
        throw new Error("hostile-revalidation-detail");
      }
    },
    runCommand: async (request) => {
      commandCalls.push(request);
      const result = options.commandResults?.[commandIndex] ?? { exitCode: 0 };
      commandIndex += 1;
      return result;
    },
  };
  return {
    dependencies,
    findCalls,
    resolveCalls,
    revalidateCalls,
    commandCalls,
  };
}

function executionOptions(
  dependencies: BootstrapExecutionDependencies,
  overrides: Partial<Parameters<typeof executeBootstrap>[0]> = {},
): Parameters<typeof executeBootstrap>[0] {
  return {
    exactVersion: EXACT_VERSION,
    ephemeralInvocationPath:
      "/Users/test/.npm/_npx/cache/node_modules/.bin/side-glance",
    currentRunnerIdentity: identityToken(
      "/Users/test/.npm/_npx/cache/node_modules/.bin/side-glance",
      "/Users/test/.npm/_npx/cache/node_modules/side-glance/dist/side-glance.mjs",
    ),
    environment: {
      PATH: "/Users/test/.npm/_npx/cache/node_modules/.bin:/usr/local/bin",
      npm_command: "exec",
      npm_execpath: "/usr/local/lib/node_modules/npm/bin/npm-cli.js",
      npm_lifecycle_event: "npx",
      npm_config_cache: "/Users/test/.npm",
      SIDE_GLANCE_SAFE_SENTINEL: "preserved",
    },
    cwd: "/Users/test/project",
    target: { platform: "darwin", arch: "arm64" },
    installMethod: "npm",
    dryRun: false,
    json: true,
    providers: ["claude"],
    notifications: ["claude"],
    providerTargets: [
      {
        provider: "claude",
        configPath: "/Users/test/.claude/settings.json",
      },
    ],
    delegatedSetupArguments: [
      "--providers",
      "claude",
      "--notifications",
      "claude",
      "--yes",
      "--json",
    ],
    dependencies,
    ...overrides,
  };
}

test("offers bootstrap installation only on the published platform boundary", () => {
  assert.deepEqual(
    classifyBootstrapTarget({ platform: "darwin", arch: "arm64" }),
    { supported: true, experimental: false },
  );
  assert.deepEqual(
    classifyBootstrapTarget({ platform: "darwin", arch: "x64" }),
    { supported: true, experimental: true },
  );
  assert.deepEqual(
    classifyBootstrapTarget({ platform: "linux", arch: "arm64", libc: "glibc" }),
    { supported: true, experimental: false },
  );
  assert.deepEqual(
    classifyBootstrapTarget({ platform: "linux", arch: "x64", libc: "musl" }),
    {
      supported: false,
      experimental: false,
      reason: "unsupported-libc",
    },
  );
  assert.deepEqual(
    classifyBootstrapTarget({ platform: "win32", arch: "x64" }),
    {
      supported: false,
      experimental: false,
      reason: "unsupported-platform",
    },
  );
});

test("pins exact npm installs and distinguishes Homebrew install from upgrade", () => {
  assert.deepEqual(buildNpmInstallArguments(EXACT_VERSION), [
    "install",
    "--global",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    `side-glance@${EXACT_VERSION}`,
  ]);
  assert.deepEqual(buildHomebrewInstallArguments(false), [
    "install",
    "AndrewUlloa/tap/side-glance",
  ]);
  assert.deepEqual(buildHomebrewInstallArguments(true), [
    "upgrade",
    "AndrewUlloa/tap/side-glance",
  ]);
  assert.throws(() => buildNpmInstallArguments("latest"), /exact version/i);
  assert.throws(
    () => buildNpmInstallArguments(`${EXACT_VERSION}\n--unsafe`),
    /exact version/i,
  );
});

test("projects a versioned staged plan with provider actions and launches deferred", () => {
  assert.deepEqual(
    createBootstrapPlan({
      exactVersion: EXACT_VERSION,
      ephemeralInvocationPath:
        "/Users/test/.npm/_npx/cache/node_modules/.bin/side-glance",
      target: { platform: "darwin", arch: "arm64" },
      installMethod: "npm",
      packageManagerPath: "/usr/local/bin/npm",
      providers: ["claude", "codex"],
      notifications: ["claude"],
      providerTargets: [
        {
          provider: "claude",
          configPath: "/Users/test/.claude/settings.json",
        },
        {
          provider: "codex",
          configPath: "/Users/test/.codex/hooks.json",
        },
      ],
    }),
    {
      schemaVersion: 1,
      kind: "bootstrap-plan",
      ephemeralRunner: {
        invocationPath:
          "/Users/test/.npm/_npx/cache/node_modules/.bin/side-glance",
        version: EXACT_VERSION,
      },
      durableExecutable: { status: "pending" },
      target: {
        platform: "darwin",
        arch: "arm64",
        supported: true,
        experimental: false,
      },
      installer: {
        method: "npm",
        command: {
          executablePath: "/usr/local/bin/npm",
          arguments: [
            "install",
            "--global",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
            `side-glance@${EXACT_VERSION}`,
          ],
        },
      },
      requested: {
        providers: ["claude", "codex"],
        notifications: ["claude"],
      },
      providerActions: [
        {
          provider: "claude",
          configPath: "/Users/test/.claude/settings.json",
          action: "deferred",
        },
        {
          provider: "codex",
          configPath: "/Users/test/.codex/hooks.json",
          action: "deferred",
        },
      ],
      launchCommands: "deferred",
    },
  );
});

test("resolves a package manager once to a stable absolute PATH candidate", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "side-glance-bootstrap-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const cacheBin = path.join(directory, "npm-cache", "_npx", "bin");
  const stableBin = path.join(directory, "stable-bin");
  const stableTarget = path.join(directory, "npm-target");
  const stableInvocation = path.join(stableBin, "npm");
  await mkdir(cacheBin, { recursive: true });
  await mkdir(stableBin, { recursive: true });
  await writeFile(path.join(cacheBin, "npm"), "#!/bin/sh\nexit 0\n");
  await chmod(path.join(cacheBin, "npm"), 0o755);
  await writeFile(stableTarget, "#!/bin/sh\nexit 0\n");
  await chmod(stableTarget, 0o755);
  await symlink(stableTarget, stableInvocation);

  const resolved = await resolvePackageManagerOnPath("npm", {
    cwd: directory,
    environment: {
      PATH: `${cacheBin}${path.delimiter}${stableBin}`,
      npm_command: "exec",
      npm_config_cache: path.join(directory, "npm-cache"),
    },
  });

  assert.equal(resolved?.name, "npm");
  assert.equal(resolved?.invocationPath, stableInvocation);
  assert.equal(resolved?.realPath, await realpath(stableTarget));
  assert.equal(resolved?.identity.invocationPath, stableInvocation);
});

test("package-manager resolution rejects executables reached through a symlinked npm cache root", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "side-glance-bootstrap-cache-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const realCache = path.join(directory, "real-cache");
  const cacheAlias = path.join(directory, "configured-cache");
  const cachedBin = path.join(realCache, "tools");
  const stableBin = path.join(directory, "stable-bin");
  const cachedNpm = path.join(cachedBin, "npm");
  const stableNpm = path.join(stableBin, "npm");
  await mkdir(cachedBin, { recursive: true });
  await mkdir(stableBin, { recursive: true });
  await writeFile(cachedNpm, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  await writeFile(stableNpm, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  await symlink(realCache, cacheAlias);

  const resolved = await resolvePackageManagerOnPath("npm", {
    cwd: directory,
    environment: {
      PATH: [cachedBin, stableBin].join(path.delimiter),
      npm_config_cache: cacheAlias,
    },
  });

  assert.equal(resolved?.invocationPath, stableNpm);
});

test("installs with exact npm argv, independently finds the durable binary, and delegates with sanitized state", async () => {
  const durable = durableExecutable(
    "/usr/local/bin/side-glance",
    `/usr/local/lib/node_modules/side-glance/${EXACT_VERSION}/side-glance`,
  );
  const fixture = fixtureDependencies({
    durableResults: [undefined, durable],
    manager: packageManager("npm", "/usr/local/bin/npm"),
    commandResults: [
      { exitCode: 0 },
      {
        exitCode: 0,
        stdout:
          '{"schemaVersion":1,"kind":"setup-result","providers":[{"id":"claude","changed":true}]}\n',
      },
    ],
  });

  const result = await executeBootstrap(executionOptions(fixture.dependencies));

  assert.equal(fixture.findCalls.length, 2);
  assert.equal(fixture.findCalls[0]?.expectedVersion, EXACT_VERSION);
  assert.equal(
    fixture.findCalls[0]?.currentRunnerIdentity?.realPath,
    "/Users/test/.npm/_npx/cache/node_modules/side-glance/dist/side-glance.mjs",
  );
  assert.deepEqual(fixture.resolveCalls, ["npm"]);
  assert.equal(fixture.revalidateCalls[0]?.invocationPath, "/usr/local/bin/npm");
  assert.equal(
    fixture.revalidateCalls[1]?.invocationPath,
    "/usr/local/bin/side-glance",
  );
  assert.deepEqual(fixture.commandCalls[0], {
    executablePath: "/usr/local/bin/npm",
    arguments: [
      "install",
      "--global",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      `side-glance@${EXACT_VERSION}`,
    ],
    shell: false,
    environment: {
      PATH: "/usr/local/bin",
      npm_config_cache: "/Users/test/.npm",
      SIDE_GLANCE_SAFE_SENTINEL: "preserved",
    },
    stdio: "capture",
    timeoutMs: 120_000,
    maxOutputBytes: 8_192,
  });
  assert.deepEqual(fixture.commandCalls[1], {
    executablePath: "/usr/local/bin/side-glance",
    arguments: [
      "init",
      "--providers",
      "claude",
      "--notifications",
      "claude",
      "--yes",
      "--json",
      "--executable",
      "/usr/local/bin/side-glance",
    ],
    shell: false,
    environment: {
      PATH: "/usr/local/bin",
      npm_config_cache: "/Users/test/.npm",
      SIDE_GLANCE_SAFE_SENTINEL: "preserved",
    },
    stdio: "capture",
    timeoutMs: 120_000,
    maxOutputBytes: 8_192,
  });
  assert.deepEqual(result, {
    schemaVersion: 1,
    kind: "bootstrap-result",
    ephemeralRunner: {
      invocationPath:
        "/Users/test/.npm/_npx/cache/node_modules/.bin/side-glance",
      version: EXACT_VERSION,
    },
    durableExecutable: {
      invocationPath: "/usr/local/bin/side-glance",
      version: EXACT_VERSION,
    },
    installMethod: "npm",
    packageInstalled: true,
    setupApplied: true,
    installer: { exitCode: 0 },
    delegatedSetup: {
      exitCode: 0,
      result: {
        schemaVersion: 1,
        kind: "setup-result",
        providers: [{ id: "claude", changed: true }],
      },
    },
  });
});

test("uses an existing exact-version durable executable without invoking an installer", async () => {
  const durable = durableExecutable("/opt/homebrew/bin/side-glance");
  const fixture = fixtureDependencies({
    durableResults: [durable],
    commandResults: [
      {
        exitCode: 0,
        stdout: '{"schemaVersion":1,"kind":"setup-plan","providers":[]}\n',
      },
    ],
  });

  const result = await executeBootstrap(
    executionOptions(fixture.dependencies, {
      installMethod: "homebrew",
      dryRun: true,
      delegatedSetupArguments: ["--dry-run", "--json"],
    }),
  );

  assert.deepEqual(fixture.resolveCalls, []);
  assert.equal(fixture.commandCalls.length, 1);
  assert.equal(fixture.commandCalls[0]?.executablePath, durable.invocationPath);
  assert.deepEqual(fixture.commandCalls[0]?.arguments, [
    "init",
    "--dry-run",
    "--json",
    "--executable",
    durable.invocationPath,
  ]);
  assert.equal(result.kind, "setup-plan");
});

test("returns a bounded versioned delegated setup result in JSON mode", async () => {
  const durable = durableExecutable("/opt/homebrew/bin/side-glance");
  const fixture = fixtureDependencies({
    durableResults: [durable],
    commandResults: [
      {
        exitCode: 0,
        stdout:
          '{"schemaVersion":1,"kind":"setup-plan","providers":[]}\n',
      },
    ],
  });

  const result = await executeBootstrap(
    executionOptions(fixture.dependencies, {
      installMethod: "none",
      dryRun: true,
      delegatedSetupArguments: ["--dry-run", "--json"],
    }),
  );

  assert.deepEqual(result, {
    schemaVersion: 1,
    kind: "setup-plan",
    providers: [],
  });
});

test("rejects delegated setup JSON with unknown or unsafe fields", async () => {
  const durable = durableExecutable("/opt/homebrew/bin/side-glance");
  const sentinel = "PRIVATE_TOKEN_DO_NOT_FORWARD";
  const fixture = fixtureDependencies({
    durableResults: [durable],
    commandResults: [
      {
        exitCode: 0,
        stdout: `${JSON.stringify({
          schemaVersion: 1,
          kind: "setup-plan",
          mode: "dry-run",
          executablePath: durable.invocationPath,
          providers: [],
          notificationSound: null,
          guidance: [],
          secret: `${sentinel}\u001b[31m`,
        })}\n`,
      },
    ],
  });

  await assert.rejects(
    executeBootstrap(
      executionOptions(fixture.dependencies, {
        installMethod: "none",
        dryRun: true,
        delegatedSetupArguments: ["--dry-run", "--json"],
      }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof BootstrapError);
      assert.equal(error.code, "delegated-setup-failed");
      assert.doesNotMatch(error.message, new RegExp(sentinel, "u"));
      assert.doesNotMatch(JSON.stringify(error.toJSON()), new RegExp(sentinel, "u"));
      return true;
    },
  );
});

test("existing durable JSON dry-run returns the authoritative setup plan directly", async () => {
  const durable = durableExecutable("/opt/homebrew/bin/side-glance");
  const plan = {
    schemaVersion: 1 as const,
    kind: "setup-plan" as const,
    mode: "dry-run",
    providers: [],
  };
  const fixture = fixtureDependencies({
    durableResults: [durable],
    commandResults: [{ exitCode: 0, stdout: `${JSON.stringify(plan)}\n` }],
  });

  const result = await executeBootstrap(
    executionOptions(fixture.dependencies, {
      installMethod: "none",
      dryRun: true,
      delegatedSetupArguments: ["--dry-run", "--json"],
    }),
  );

  assert.deepEqual(result, plan);
});

test("keeps a no-install dry-run staged and never reaches a package manager or delegate", async () => {
  const fixture = fixtureDependencies({ durableResults: [undefined] });

  const result = await executeBootstrap(
    executionOptions(fixture.dependencies, {
      installMethod: "none",
      dryRun: true,
    }),
  );

  assert.equal(result.kind, "bootstrap-plan");
  assert.deepEqual(result.installer, { method: "none", command: null });
  assert.deepEqual(fixture.resolveCalls, []);
  assert.deepEqual(fixture.commandCalls, []);
});

test("never falls back when the explicitly selected package manager is unavailable", async () => {
  const fixture = fixtureDependencies({ durableResults: [undefined] });

  await assert.rejects(
    executeBootstrap(
      executionOptions(fixture.dependencies, { installMethod: "homebrew" }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof BootstrapError);
      assert.equal(error.code, "package-manager-unavailable");
      assert.equal(error.projection.installMethod, "homebrew");
      return true;
    },
  );
  assert.deepEqual(fixture.resolveCalls, ["brew"]);
  assert.deepEqual(fixture.commandCalls, []);
});

test("fails unsupported installation targets before resolving or running a package manager", async () => {
  const fixture = fixtureDependencies({ durableResults: [undefined] });

  await assert.rejects(
    executeBootstrap(
      executionOptions(fixture.dependencies, {
        target: { platform: "linux", arch: "x64", libc: "musl" },
      }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof BootstrapError);
      assert.equal(error.code, "unsupported-target");
      return true;
    },
  );
  assert.deepEqual(fixture.resolveCalls, []);
  assert.deepEqual(fixture.commandCalls, []);
});

test("reports bounded redacted installer failure without exposing hostile child output", async () => {
  const fixture = fixtureDependencies({
    durableResults: [undefined],
    manager: packageManager("npm", "/usr/local/bin/npm"),
    commandResults: [
      {
        exitCode: 23,
        stdout: "npm-token=top-secret\u001b[31m",
        stderr: "authorization=also-secret",
      },
    ],
  });

  await assert.rejects(
    executeBootstrap(executionOptions(fixture.dependencies)),
    (error: unknown) => {
      assert.ok(error instanceof BootstrapError);
      assert.equal(error.code, "installer-failed");
      assert.deepEqual(error.projection, {
        schemaVersion: 1,
        kind: "bootstrap-error",
        code: "installer-failed",
        installMethod: "npm",
        packageInstalled: false,
        setupApplied: false,
        child: { exitCode: 23 },
      });
      assert.doesNotMatch(JSON.stringify(error), /top-secret|also-secret|authorization/);
      return true;
    },
  );
});

test("fails closed when captured child output exceeds its bootstrap bound", async () => {
  const fixture = fixtureDependencies({
    durableResults: [undefined],
    manager: packageManager("npm", "/usr/local/bin/npm"),
    commandResults: [{ exitCode: 0, stdout: "sensitive".repeat(10) }],
  });

  await assert.rejects(
    executeBootstrap(
      executionOptions(fixture.dependencies, { maxChildOutputBytes: 32 }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof BootstrapError);
      assert.equal(error.code, "installer-failed");
      assert.deepEqual(error.projection.child, {
        exitCode: 0,
        outputExceeded: true,
      });
      assert.doesNotMatch(JSON.stringify(error), /sensitive/);
      return true;
    },
  );
  assert.equal(fixture.findCalls.length, 1);
});

test("retains a Homebrew package but blocks setup when the tap lags the invoking version", async () => {
  const fixture = fixtureDependencies({
    durableResults: [undefined, undefined],
    manager: packageManager("brew", "/opt/homebrew/bin/brew"),
    commandResults: [{ exitCode: 0 }],
  });

  await assert.rejects(
    executeBootstrap(
      executionOptions(fixture.dependencies, {
        installMethod: "homebrew",
        homebrewFormulaInstalled: true,
      }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof BootstrapError);
      assert.equal(error.code, "homebrew-version-lag");
      assert.equal(error.projection.packageInstalled, true);
      assert.equal(error.projection.setupApplied, false);
      assert.equal(error.projection.cleanup?.kind, "homebrew-upgrade-retained");
      assert.doesNotMatch(error.message, /npm.*fallback/i);
      return true;
    },
  );
  assert.deepEqual(fixture.commandCalls[0]?.arguments, [
    "upgrade",
    "AndrewUlloa/tap/side-glance",
  ]);
  assert.equal(fixture.commandCalls.length, 1);
});

test("Homebrew post-install refuses a versioned Cellar invocation instead of persisting it", async () => {
  const cellar = durableExecutable(
    `/opt/homebrew/Cellar/side-glance/${EXACT_VERSION}/bin/side-glance`,
  );
  const fixture = fixtureDependencies({
    durableResults: [undefined, cellar],
    manager: packageManager("brew", "/opt/homebrew/bin/brew"),
    commandResults: [{ exitCode: 0 }],
  });

  await assert.rejects(
    executeBootstrap(
      executionOptions(fixture.dependencies, {
        installMethod: "homebrew",
        homebrewFormulaInstalled: false,
      }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof BootstrapError);
      assert.equal(error.code, "homebrew-version-lag");
      assert.equal(error.projection.setupApplied, false);
      return true;
    },
  );
  assert.equal(fixture.commandCalls.length, 1);
  assert.equal(
    fixture.findCalls[1]?.environment.PATH,
    "/opt/homebrew/bin",
  );
});

test("distinguishes a retained package from a delegated setup failure", async () => {
  const durable = durableExecutable("/usr/local/bin/side-glance");
  const fixture = fixtureDependencies({
    durableResults: [undefined, durable],
    manager: packageManager("npm", "/usr/local/bin/npm"),
    commandResults: [
      { exitCode: 0 },
      { exitCode: 1, stderr: "hostile-user-config-value=never-forward" },
    ],
  });

  await assert.rejects(
    executeBootstrap(executionOptions(fixture.dependencies)),
    (error: unknown) => {
      assert.ok(error instanceof BootstrapError);
      assert.equal(error.code, "delegated-setup-failed");
      assert.equal(error.projection.packageInstalled, true);
      assert.equal(error.projection.setupApplied, false);
      assert.equal(error.projection.child?.exitCode, 1);
      assert.equal(error.projection.cleanup?.kind, "npm-global-package-retained");
      assert.doesNotMatch(JSON.stringify(error), /hostile-user-config-value/);
      return true;
    },
  );
});

test("rejects bootstrap-only options from the durable setup handoff", async () => {
  const durable = durableExecutable("/usr/local/bin/side-glance");
  const fixture = fixtureDependencies({ durableResults: [durable] });

  await assert.rejects(
    executeBootstrap(
      executionOptions(fixture.dependencies, {
        delegatedSetupArguments: ["--install", "npm", "--yes"],
      }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof BootstrapError);
      assert.equal(error.code, "invalid-options");
      return true;
    },
  );
  assert.deepEqual(fixture.commandCalls, []);
});

test("rejects unsafe durable handoff arguments before installing a package", async () => {
  const fixture = fixtureDependencies({
    durableResults: [undefined],
    manager: packageManager("npm", "/usr/local/bin/npm"),
  });

  await assert.rejects(
    executeBootstrap(
      executionOptions(fixture.dependencies, {
        delegatedSetupArguments: ["--install=npm", "--yes"],
      }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof BootstrapError);
      assert.equal(error.code, "invalid-options");
      assert.equal(error.projection.installMethod, "npm");
      return true;
    },
  );
  assert.deepEqual(fixture.resolveCalls, []);
  assert.deepEqual(fixture.commandCalls, []);
});

test("keeps package-installed state when the durable executable changes before handoff", async () => {
  const durable = durableExecutable("/usr/local/bin/side-glance");
  const fixture = fixtureDependencies({
    durableResults: [undefined, durable],
    manager: packageManager("npm", "/usr/local/bin/npm"),
    commandResults: [{ exitCode: 0 }],
    revalidateFailureAt: 2,
  });

  await assert.rejects(
    executeBootstrap(executionOptions(fixture.dependencies)),
    (error: unknown) => {
      assert.ok(error instanceof BootstrapError);
      assert.equal(error.code, "invalid-options");
      assert.equal(error.projection.installMethod, "npm");
      assert.equal(error.projection.packageInstalled, true);
      assert.equal(error.projection.cleanup?.kind, "npm-global-package-retained");
      assert.doesNotMatch(JSON.stringify(error), /hostile-revalidation-detail/);
      return true;
    },
  );
  assert.equal(fixture.commandCalls.length, 1);
});
