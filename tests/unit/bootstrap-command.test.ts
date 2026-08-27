import assert from "node:assert/strict";
import test from "node:test";

import {
  runBootstrapChildCommand,
  runBootstrapInit,
} from "../../src/cli/bootstrap-command.ts";
import type {
  BootstrapCommandRequest,
  BootstrapExecutionDependencies,
} from "../../src/cli/bootstrap.ts";
import type { ExecutableIdentityToken } from "../../src/cli/executable.ts";
import type { PromptOutcome, SetupPrompter } from "../../src/cli/prompts.ts";

const exactVersion = "0.1.0-beta.9";
const invocationPath = "/Users/example/.npm/_npx/cache/side-glance";

test("bootstrap child escalates after a bounded grace period when SIGTERM is ignored", async () => {
  const startedAt = Date.now();
  const result = await runBootstrapChildCommand({
    executablePath: process.execPath,
    arguments: [
      "--input-type=module",
      "--eval",
      "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);",
    ],
    shell: false,
    environment: process.env,
    stdio: "capture",
    timeoutMs: 1_000,
    maxOutputBytes: 1_024,
  });

  assert.equal(result.timedOut, true);
  assert.equal(result.signal, "SIGKILL");
  assert.ok(Date.now() - startedAt < 3_000);
});

test("bootstrap child forwards parent cancellation and settles", async () => {
  const controller = new AbortController();
  const pending = runBootstrapChildCommand({
    executablePath: process.execPath,
    arguments: [
      "--input-type=module",
      "--eval",
      "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);",
    ],
    shell: false,
    environment: process.env,
    stdio: "capture",
    timeoutMs: 10_000,
    maxOutputBytes: 1_024,
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 250);

  const result = await pending;
  assert.equal(result.aborted, true);
  assert.ok(
    result.signal === "SIGTERM" || result.signal === "SIGKILL",
    `expected forwarded termination, received ${result.signal ?? "no signal"}`,
  );
});

test("ephemeral JSON dry-run with no installer emits one deferred bootstrap plan", async () => {
  let stdout = "";
  let commands = 0;
  const code = await runBootstrapInit(
    [
      "--install",
      "none",
      "--providers",
      "claude",
      "--notifications",
      "none",
      "--dry-run",
      "--json",
      "--home",
      "/Users/example",
    ],
    options({
      findDurableExecutable: async () => undefined,
      runCommand: async () => {
        commands += 1;
        return { exitCode: 0 };
      },
    }, (value) => {
      stdout += value;
    }),
  );

  assert.equal(code, 0);
  assert.equal(commands, 0);
  const plan = JSON.parse(stdout);
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.kind, "bootstrap-plan");
  assert.equal(plan.providerActions[0].provider, "claude");
  assert.equal(plan.providerActions[0].action, "deferred");
  assert.equal(plan.launchCommands, "deferred");
});

test("ephemeral automation delegates to an existing exact durable executable", async () => {
  let stdout = "";
  const commands: Array<{ executablePath: string; arguments: readonly string[] }> = [];
  const durablePath = "/opt/homebrew/bin/side-glance";
  const code = await runBootstrapInit(
    [
      "--install",
      "npm",
      "--providers",
      "claude",
      "--notifications",
      "none",
      "--yes",
      "--json",
    ],
    options({
      findDurableExecutable: async () => ({
        invocationPath: durablePath,
        realPath: "/opt/homebrew/Cellar/side-glance/bin/side-glance",
        version: exactVersion,
        identity: identity(durablePath, 10),
      }),
      runCommand: async (request) => {
        commands.push(request);
        return {
          exitCode: 0,
          stdout: `${JSON.stringify({
            schemaVersion: 1,
            kind: "setup-result",
            providers: [{ id: "claude", changed: true }],
          })}\n`,
        };
      },
    }, (value) => {
      stdout += value;
    }),
  );

  assert.equal(code, 0);
  assert.deepEqual(commands.map(({ executablePath, arguments: arguments_ }) => ({
    executablePath,
    arguments: arguments_,
  })), [
    {
      executablePath: durablePath,
      arguments: [
        "init",
        "--providers",
        "claude",
        "--notifications",
        "none",
        "--yes",
        "--json",
        "--executable",
        durablePath,
      ],
    },
  ]);
  const result = JSON.parse(stdout);
  assert.equal(result.kind, "bootstrap-result");
  assert.equal(result.installMethod, "existing");
  assert.equal(result.packageInstalled, false);
  assert.equal(result.setupApplied, true);
  assert.equal(result.delegatedSetup.result.kind, "setup-result");
});

test("delegated durable SIGINT preserves exit 130 with one bootstrap error", async () => {
  let stdout = "";
  const durablePath = "/opt/homebrew/bin/side-glance";
  const code = await runBootstrapInit(
    [
      "--install",
      "npm",
      "--providers",
      "claude",
      "--notifications",
      "none",
      "--yes",
      "--json",
    ],
    options(
      {
        findDurableExecutable: async () => ({
          invocationPath: durablePath,
          realPath: "/opt/homebrew/Cellar/side-glance/bin/side-glance",
          version: exactVersion,
          identity: identity(durablePath, 10),
        }),
        runCommand: async () => ({ exitCode: 130, stdout: "" }),
      },
      (value) => {
        stdout += value;
      },
    ),
  );

  assert.equal(code, 130);
  assert.deepEqual(JSON.parse(stdout), {
    schemaVersion: 1,
    kind: "bootstrap-error",
    code: "interrupted",
    installMethod: "existing",
    packageInstalled: false,
    setupApplied: false,
    child: { exitCode: 130 },
  });
});

test("human post-install failure reports the retained package cleanup command", async () => {
  let stderr = "";
  let findCalls = 0;
  const npm = {
    name: "npm" as const,
    invocationPath: "/usr/local/bin/npm",
    realPath: "/usr/local/bin/npm",
    identity: identity("/usr/local/bin/npm", 20),
  };
  const base = options(
    {
      findDurableExecutable: async () => {
        findCalls += 1;
        return undefined;
      },
      resolvePackageManager: async (name) =>
        name === "npm" ? npm : undefined,
      runCommand: async () => ({ exitCode: 0 }),
    },
    () => undefined,
  );
  const code = await runBootstrapInit(
    [
      "--install",
      "npm",
      "--providers",
      "claude",
      "--notifications",
      "none",
      "--yes",
    ],
    {
      ...base,
      writeStderr: (value) => {
        stderr += value;
      },
    },
  );

  assert.equal(code, 1);
  assert.equal(findCalls, 2);
  assert.match(stderr, /package remains installed/iu);
  assert.match(stderr, /\/usr\/local\/bin\/npm uninstall --global side-glance/u);
});

test("interactive preview-only choice cancels before any command", async () => {
  let commands = 0;
  const prompter = scriptedPrompter([
    { status: "value", value: "none" },
  ]);
  const code = await runBootstrapInit([], {
    ...options({
      findDurableExecutable: async () => undefined,
      runCommand: async () => {
        commands += 1;
        return { exitCode: 0 };
      },
    }, () => undefined),
    interactive: true,
    prompter,
  });

  assert.equal(code, 0);
  assert.equal(commands, 0);
  assert.match(prompter.rendered.join("\n"), /preview-only|No package/u);
  assert.equal(prompter.closed, true);
});

test("interactive unsupported targets offer preview only without resolving installers", async () => {
  let managerResolutions = 0;
  const prompter = scriptedPrompter([
    { status: "value", value: "none" },
  ]);
  const code = await runBootstrapInit([], {
    ...options(
      {
        findDurableExecutable: async () => undefined,
        resolvePackageManager: async () => {
          managerResolutions += 1;
          return undefined;
        },
      },
      () => undefined,
    ),
    target: { platform: "win32", arch: "x64" },
    interactive: true,
    prompter,
  });

  assert.equal(code, 0);
  assert.equal(managerResolutions, 0);
  assert.match(prompter.rendered.join("\n"), /No package was installed/u);
});

test("interactive durable handoff resolves once and releases the parent TTY first", async () => {
  const durablePath = "/opt/homebrew/bin/side-glance";
  const prompter = scriptedPrompter([]);
  let findCalls = 0;
  let closedBeforeHandoff = false;
  const code = await runBootstrapInit([], {
    ...options(
      {
        findDurableExecutable: async () => {
          findCalls += 1;
          return {
            invocationPath: durablePath,
            realPath: "/opt/homebrew/Cellar/side-glance/bin/side-glance",
            version: exactVersion,
            identity: identity(durablePath, 10),
          };
        },
        runCommand: async () => {
          closedBeforeHandoff = prompter.closed;
          return { exitCode: 0 };
        },
      },
      () => undefined,
    ),
    interactive: true,
    prompter,
  });

  assert.equal(code, 0);
  assert.equal(findCalls, 1);
  assert.equal(closedBeforeHandoff, true);
});

test("interactive durable handoff lets the durable command own successful human output", async () => {
  let stdout = "";
  const durablePath = "/opt/homebrew/bin/side-glance";
  const prompter = scriptedPrompter([]);
  const code = await runBootstrapInit([], {
    ...options(
      {
        findDurableExecutable: async () => ({
          invocationPath: durablePath,
          realPath: "/opt/homebrew/Cellar/side-glance/bin/side-glance",
          version: exactVersion,
          identity: identity(durablePath, 10),
        }),
        runCommand: async () => ({ exitCode: 0 }),
      },
      (value) => {
        stdout += value;
      },
    ),
    interactive: true,
    prompter,
  });

  assert.equal(code, 0);
  assert.equal(stdout, "");
});

test("human durable handoff failures report a bounded cause and recovery commands", async () => {
  const durablePath = "/opt/homebrew/bin/side-glance";
  const fixtures = [
    {
      child: { exitCode: 1 },
      expectedCode: 1,
      message: /setup exited with code 1/iu,
    },
    {
      child: { exitCode: null, signal: "SIGTERM" },
      expectedCode: 1,
      message: /setup stopped after signal SIGTERM/iu,
    },
    {
      child: { exitCode: null, signal: "SIGKILL", timedOut: true },
      expectedCode: 1,
      message: /setup timed out/iu,
    },
    {
      child: { exitCode: 1, outputExceeded: true },
      expectedCode: 1,
      message: /setup produced more output than could be handled safely/iu,
    },
    {
      child: { exitCode: 130 },
      expectedCode: 130,
      message: /setup was interrupted/iu,
    },
  ] as const;

  for (const fixture of fixtures) {
    let stderr = "";
    const prompter = scriptedPrompter([]);
    const code = await runBootstrapInit([], {
      ...options(
        {
          findDurableExecutable: async () => ({
            invocationPath: durablePath,
            realPath: "/opt/homebrew/Cellar/side-glance/bin/side-glance",
            version: exactVersion,
            identity: identity(durablePath, 10),
          }),
          runCommand: async () => fixture.child,
        },
        () => undefined,
      ),
      interactive: true,
      prompter,
      writeStderr: (value) => {
        stderr += value;
      },
    });

    assert.equal(code, fixture.expectedCode);
    assert.match(stderr, fixture.message);
    assert.match(stderr, /Try again:\s+side-glance init/u);
    assert.match(stderr, /For details:\s+side-glance doctor --json/u);
    assert.doesNotMatch(stderr, /nothing (?:was )?changed|rolled back/iu);
  }
});

test("Homebrew dry-run never executes the package manager", async () => {
  let stdout = "";
  const calls: BootstrapCommandRequest[] = [];
  const brew = {
    name: "brew" as const,
    invocationPath: "/private/test/homebrew/bin/brew",
    realPath: "/private/test/homebrew/bin/brew",
    identity: identity("/private/test/homebrew/bin/brew", 20),
  };

  const code = await runBootstrapInit(
    [
      "--install",
      "homebrew",
      "--providers",
      "claude",
      "--notifications",
      "none",
      "--dry-run",
      "--json",
    ],
    options(
      {
        findDurableExecutable: async () => undefined,
        resolvePackageManager: async (name) =>
          name === "brew" ? brew : undefined,
        runCommand: async (request) => {
          calls.push(request);
          return { exitCode: 0 };
        },
      },
      (value) => {
        stdout += value;
      },
    ),
  );

  assert.equal(code, 0);
  assert.equal(JSON.parse(stdout).kind, "bootstrap-plan");
  assert.deepEqual(calls, []);
});

test("Homebrew planning revalidates its manager without inherited npm-exec markers", async () => {
  const revalidatedEnvironments: Readonly<Record<string, string | undefined>>[] = [];
  const brew = {
    name: "brew" as const,
    invocationPath: "/private/test/homebrew/bin/brew",
    realPath: "/private/test/homebrew/bin/brew",
    identity: identity("/private/test/homebrew/bin/brew", 20),
  };

  const code = await runBootstrapInit(
    [
      "--install",
      "homebrew",
      "--providers",
      "claude",
      "--notifications",
      "none",
      "--dry-run",
      "--json",
    ],
    options(
      {
        findDurableExecutable: async () => undefined,
        resolvePackageManager: async () => brew,
        revalidateExecutable: async (_identity, request) => {
          revalidatedEnvironments.push(request?.environment ?? {});
        },
      },
      () => undefined,
    ),
  );

  assert.equal(code, 0);
  assert.ok(revalidatedEnvironments.length > 0);
  for (const environment of revalidatedEnvironments) {
    assert.equal(environment.npm_command, undefined);
    assert.equal(environment.npm_lifecycle_event, undefined);
  }
});

test("interactive Homebrew preview performs no package-manager command before approval", async () => {
  const calls: BootstrapCommandRequest[] = [];
  const brew = {
    name: "brew" as const,
    invocationPath: "/private/test/homebrew/bin/brew",
    realPath: "/private/test/homebrew/bin/brew",
    identity: identity("/private/test/homebrew/bin/brew", 20),
  };
  const prompter = scriptedPrompter([
    { status: "value", value: "homebrew" },
    { status: "value", value: false },
  ]);

  const code = await runBootstrapInit([], {
    ...options(
      {
        findDurableExecutable: async () => undefined,
        resolvePackageManager: async (name) =>
          name === "brew" ? brew : undefined,
        runCommand: async (request) => {
          calls.push(request);
          return { exitCode: 0 };
        },
      },
      () => undefined,
    ),
    interactive: true,
    prompter,
  });

  assert.equal(code, 0);
  assert.deepEqual(calls, []);
  assert.match(prompter.rendered.join("\n"), /brew.*install/iu);
});

test("Homebrew automation uses the read-only detected formula state to choose upgrade", async () => {
  const brew = {
    name: "brew" as const,
    invocationPath: "/opt/homebrew/bin/brew",
    realPath: "/opt/homebrew/bin/brew",
    identity: identity("/opt/homebrew/bin/brew", 20),
  };
  const calls: Array<{ executablePath: string; arguments: readonly string[] }> = [];
  let findCalls = 0;
  const code = await runBootstrapInit(
    [
      "--install",
      "homebrew",
      "--providers",
      "claude",
      "--notifications",
      "none",
      "--yes",
      "--json",
    ],
    {
      ...options({
        findDurableExecutable: async () => {
          findCalls += 1;
          return findCalls === 1
            ? undefined
            : {
                invocationPath: "/opt/homebrew/bin/side-glance",
                realPath: "/opt/homebrew/Cellar/side-glance/bin/side-glance",
                version: exactVersion,
                identity: identity("/opt/homebrew/bin/side-glance", 30),
              };
        },
        resolvePackageManager: async (name) => (name === "brew" ? brew : undefined),
        runCommand: async (request) => {
          calls.push(request);
          if (request.arguments[0] === "init") {
            return {
              exitCode: 0,
              stdout: `${JSON.stringify({
                schemaVersion: 1,
                kind: "setup-result",
                providers: [],
              })}\n`,
            };
          }
          return { exitCode: 0 };
        },
      }, () => undefined),
      homebrewFormulaInstalled: true,
    },
  );

  assert.equal(code, 0);
  assert.deepEqual(
    calls.map(({ executablePath, arguments: arguments_ }) => ({
      executablePath,
      arguments: arguments_,
    })),
    [
      {
        executablePath: brew.invocationPath,
        arguments: ["upgrade", "AndrewUlloa/tap/side-glance"],
      },
      {
        executablePath: "/opt/homebrew/bin/side-glance",
        arguments: [
          "init",
          "--providers",
          "claude",
          "--notifications",
          "none",
          "--yes",
          "--json",
          "--executable",
          "/opt/homebrew/bin/side-glance",
        ],
      },
    ],
  );
});

function options(
  dependencyOverrides: Partial<BootstrapExecutionDependencies>,
  writeStdout: (value: string) => void,
) {
  const dependencies: BootstrapExecutionDependencies = {
    findDurableExecutable: async () => undefined,
    resolvePackageManager: async () => undefined,
    revalidateExecutable: async () => undefined,
    runCommand: async () => ({ exitCode: 0 }),
    ...dependencyOverrides,
  };
  return {
    exactVersion,
    invocationPath,
    currentRunnerIdentity: identity(invocationPath, 1),
    environment: {
      PATH: "/opt/homebrew/bin:/usr/bin",
      npm_command: "exec",
      npm_lifecycle_event: "npx",
    },
    target: { platform: "darwin", arch: "arm64" },
    defaultHomeDirectory: "/Users/example",
    interactive: false,
    dependencies,
    writeStdout,
    writeStderr: () => undefined,
  };
}

function identity(path: string, seed: number): ExecutableIdentityToken {
  const file = {
    device: "1",
    inode: String(seed),
    mode: "33261",
    size: "100",
    modifiedAt: seed,
    changedAt: seed,
    kind: "file" as const,
  };
  return {
    invocationPath: path,
    realPath: path,
    invocation: file,
    target: { ...file, inode: String(seed + 1) },
  };
}

function scriptedPrompter(outcomes: PromptOutcome<unknown>[]) {
  const rendered: string[] = [];
  const next = <Value>(): Promise<PromptOutcome<Value>> => {
    const outcome = outcomes.shift();
    if (!outcome) throw new Error("missing scripted prompt outcome");
    return Promise.resolve(outcome as PromptOutcome<Value>);
  };
  const prompter: SetupPrompter & { rendered: string[]; closed: boolean } = {
    rendered,
    closed: false,
    select: async () => next<string>(),
    multiselect: async () => next<string[]>(),
    confirm: async () => next<boolean>(),
    text: async () => next<string>(),
    note: (message) => rendered.push(message),
    close() {
      this.closed = true;
    },
  };
  return prompter;
}
