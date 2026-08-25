import path from "node:path";
import { spawn } from "node:child_process";
import { realpath, stat } from "node:fs/promises";

import {
  BootstrapError,
  classifyBootstrapTarget,
  createBootstrapPlan,
  executeBootstrap,
  type BootstrapExecutionDependencies,
  type BootstrapInstallMethod,
  type BootstrapPlan,
  type BootstrapCommandRequest,
  type BootstrapCommandResult,
  type ResolvedPackageManager,
  type BootstrapTarget,
} from "./bootstrap.ts";
import {
  sanitizeDelegatedEnvironment,
  type ExecutableIdentityToken,
  type ValidatedDurableExecutable,
} from "./executable.ts";
import {
  createReadlineSetupPrompter,
  type PromptOutcome,
  type SetupPrompter,
} from "./prompts.ts";
import { parseSetupArguments, type SetupRequest } from "./setup.ts";

const CHILD_TERMINATION_GRACE_MS = 250;

export interface BootstrapInitOptions {
  exactVersion: string;
  invocationPath: string;
  currentRunnerIdentity: ExecutableIdentityToken;
  environment: Readonly<Record<string, string | undefined>>;
  target: BootstrapTarget;
  defaultHomeDirectory: string;
  interactive: boolean;
  dependencies: BootstrapExecutionDependencies;
  writeStdout(value: string): void;
  writeStderr(value: string): void;
  prompter?: SetupPrompter;
  homebrewFormulaInstalled?: boolean;
  signal?: AbortSignal;
}

export function bootstrapInitHelpText(): string {
  return `Side Glance npx bootstrap

Usage:
  npx side-glance@beta init --dry-run [--install <homebrew|npm|none>]
  npx side-glance@beta init --install <homebrew|npm> --providers <list> --notifications <list|none> --yes

Options:
  --install <homebrew|npm|none> Choose the durable installation method
  --providers <list>           Claude, Codex, Gemini, and/or OpenCode
  --notifications <list|none>  Side Glance computer-notification channels
  --notification-sound <name>  Installed sound name (default: Glass)
  --dry-run                    Preview without installing or configuring providers
  --yes                        Apply a fully specified non-interactive bootstrap
  --json                       Emit exactly one versioned JSON result
  --home <absolute-path>       Override the inspected home directory
  -h, --help                   Show this help without discovery or writes
`;
}

export async function runBootstrapInit(
  args: readonly string[],
  options: BootstrapInitOptions,
): Promise<number> {
  const json = args.includes("--json");
  let request: SetupRequest;
  try {
    request = parseSetupArguments(args, {
      command: "init",
      execution: "ephemeral",
      interactive: options.interactive,
    });
  } catch {
    return writeBootstrapFailure(options, json, "invalid-options");
  }

  if (!options.interactive || request.dryRun || request.yes) {
    const installMethod = request.installMethod ?? (request.dryRun ? "none" : undefined);
    if (!installMethod) {
      return writeBootstrapFailure(options, json, "invalid-options");
    }
    return executeAndRender(args, request, installMethod, options);
  }
  return runInteractiveBootstrap(args, request, options);
}

export function runBootstrapChildCommand(
  request: BootstrapCommandRequest,
): Promise<BootstrapCommandResult> {
  return new Promise((resolve, reject) => {
    const capture = request.stdio === "capture";
    const child = spawn(request.executablePath, [...request.arguments], {
      env: request.environment as NodeJS.ProcessEnv,
      shell: false,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout: Uint8Array = new Uint8Array();
    let stderr: Uint8Array = new Uint8Array();
    let outputExceeded = false;
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let terminationTimer: ReturnType<typeof setTimeout> | undefined;
    let terminating = false;
    const terminate = () => {
      if (terminating || settled) return;
      terminating = true;
      child.kill("SIGTERM");
      terminationTimer = setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, CHILD_TERMINATION_GRACE_MS);
    };
    const onAbort = () => {
      aborted = true;
      terminate();
    };
    const append = (current: Uint8Array, chunk: Uint8Array): Uint8Array => {
      if (outputExceeded) return current;
      const total = stdout.byteLength + stderr.byteLength + chunk.byteLength;
      if (total > request.maxOutputBytes) {
        outputExceeded = true;
        terminate();
        return current;
      }
      return Buffer.concat([current, chunk]);
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      terminate();
    }, request.timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      if (terminationTimer) clearTimeout(terminationTimer);
      request.signal?.removeEventListener("abort", onAbort);
    };
    request.signal?.addEventListener("abort", onAbort, { once: true });
    if (request.signal?.aborted) onAbort();
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
    child.once("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        exitCode,
        ...(signal ? { signal } : {}),
        ...(capture ? { stdout, stderr } : {}),
        ...(timedOut ? { timedOut: true } : {}),
        ...(outputExceeded ? { outputExceeded: true } : {}),
        ...(aborted ? { aborted: true } : {}),
      });
    });
  });
}

async function runInteractiveBootstrap(
  args: readonly string[],
  request: SetupRequest,
  options: BootstrapInitOptions,
): Promise<number> {
  const prompter =
    options.prompter ??
    createReadlineSetupPrompter({ input: process.stdin, output: process.stdout });
  let prompterClosed = false;
  const closePrompter = () => {
    if (prompterClosed) return;
    prompterClosed = true;
    prompter.close();
  };
  try {
    const existing = await options.dependencies.findDurableExecutable({
      expectedVersion: options.exactVersion,
      environment: sanitizeDelegatedEnvironment(options.environment),
      currentRunnerIdentity: options.currentRunnerIdentity,
    });
    if (existing) {
      closePrompter();
      return executeAndRender(args, request, "none", options, existing);
    }

    const methods = await availableInstallMethods(options);
    const selection = await chooseOneMethod(prompter, methods.choices);
    if (selection.status === "cancelled") return cancellationCode(selection);
    if (selection.value === "none") {
      const plan = createPlan(request, "none", options);
      renderBootstrapPlan(plan, prompter);
      prompter.note("No package was installed. Provider actions remain deferred.");
      return 0;
    }

    const manager = methods.managers.get(selection.value);
    if (!manager) {
      prompter.note("That package manager is no longer available. Nothing was changed.");
      return 0;
    }
    const inspectedOptions =
      selection.value === "homebrew"
        ? await prepareHomebrewOptions(options, manager)
        : options;
    const plan = createPlan(
      request,
      selection.value,
      inspectedOptions,
      manager.invocationPath,
    );
    renderBootstrapPlan(plan, prompter);
    const confirmed = await prompter.confirm("Run this exact installer command?", false);
    if (confirmed.status === "cancelled") return cancellationCode(confirmed);
    if (!confirmed.value) {
      prompter.note("Bootstrap cancelled. Nothing was installed.");
      return 0;
    }
    const dependencies: BootstrapExecutionDependencies = {
      ...inspectedOptions.dependencies,
      resolvePackageManager: async (name) =>
        name === manager.name ? manager : undefined,
    };
    closePrompter();
    return executeAndRender(args, request, selection.value, {
      ...inspectedOptions,
      dependencies,
    }, null);
  } catch (error) {
    return renderBootstrapError(error, request.json, options);
  } finally {
    closePrompter();
  }
}

async function executeAndRender(
  args: readonly string[],
  request: SetupRequest,
  installMethod: BootstrapInstallMethod,
  options: BootstrapInitOptions,
  initialDurableExecutable?: ValidatedDurableExecutable | null,
): Promise<number> {
  try {
    const preparedOptions =
      installMethod === "homebrew"
        ? await prepareHomebrewOptions(options)
        : options;
    const result = await executeBootstrap({
      exactVersion: preparedOptions.exactVersion,
      ephemeralInvocationPath: preparedOptions.invocationPath,
      currentRunnerIdentity: preparedOptions.currentRunnerIdentity,
      environment: preparedOptions.environment,
      target: preparedOptions.target,
      installMethod,
      dryRun: request.dryRun,
      json: request.json,
      providers: request.providers ?? [],
      notifications: request.notifications ?? [],
      providerTargets: providerTargets(
        request.providers ?? [],
        request.homeDirectory ?? preparedOptions.defaultHomeDirectory,
      ),
      delegatedSetupArguments: stripBootstrapOptions(args),
      ...(preparedOptions.signal ? { signal: preparedOptions.signal } : {}),
      ...(initialDurableExecutable === undefined
        ? {}
        : { initialDurableExecutable }),
      dependencies: preparedOptions.dependencies,
      ...(preparedOptions.homebrewFormulaInstalled === undefined
        ? {}
        : {
            homebrewFormulaInstalled:
              preparedOptions.homebrewFormulaInstalled,
          }),
    });
    if (request.json) options.writeStdout(`${JSON.stringify(result)}\n`);
    else if (result.kind === "bootstrap-plan") {
      options.writeStdout("Bootstrap preview complete. No package or provider configuration was changed.\n");
    } else if (result.kind === "bootstrap-result" && !request.dryRun) {
      if (result.setupApplied === "unknown") {
        options.writeStdout(
          `Durable bootstrap complete. Package installed: ${result.packageInstalled ? "yes" : "no"}; the setup outcome is reported by the durable command above.\n`,
        );
      } else {
        options.writeStdout(
          `Durable bootstrap complete. Package installed: ${result.packageInstalled ? "yes" : "no"}; setup applied: ${result.setupApplied ? "yes" : "no"}.\n`,
        );
      }
    }
    return 0;
  } catch (error) {
    return renderBootstrapError(error, request.json, options);
  }
}

async function prepareHomebrewOptions(
  options: BootstrapInitOptions,
  resolvedManager?: ResolvedPackageManager,
): Promise<BootstrapInitOptions> {
  if (options.homebrewFormulaInstalled !== undefined) return options;
  const manager =
    resolvedManager ??
    (await options.dependencies.resolvePackageManager("brew", {
      environment: options.environment,
    }));
  if (!manager) return options;
  const environment = sanitizeDelegatedEnvironment(options.environment);
  await options.dependencies.revalidateExecutable(manager.identity, {
    environment,
  });
  return {
    ...options,
    homebrewFormulaInstalled: await homebrewFormulaInstalledOnDisk(manager),
    dependencies: {
      ...options.dependencies,
      resolvePackageManager: async (name) =>
        name === "brew" ? manager : options.dependencies.resolvePackageManager(name, {
          environment: options.environment,
        }),
    },
  };
}

async function homebrewFormulaInstalledOnDisk(
  manager: ResolvedPackageManager,
): Promise<boolean> {
  const prefix = path.dirname(path.dirname(manager.invocationPath));
  const formulaDirectory = path.join(prefix, "Cellar", "side-glance");
  try {
    if ((await stat(formulaDirectory)).isDirectory()) return true;
  } catch {
    // An unlinked or absent Cellar entry is treated as a first install.
  }
  const stableExecutable = path.join(
    path.dirname(manager.invocationPath),
    "side-glance",
  );
  try {
    const target = await realpath(stableExecutable);
    const relative = path.relative(formulaDirectory, target);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  } catch {
    return false;
  }
}

async function availableInstallMethods(
  options: BootstrapInitOptions,
): Promise<{
  choices: Array<{
    id: BootstrapInstallMethod;
    label: string;
    selected: boolean;
  }>;
  managers: ReadonlyMap<BootstrapInstallMethod, ResolvedPackageManager>;
}> {
  const choices: Array<{
    id: BootstrapInstallMethod;
    label: string;
    selected: boolean;
  }> = [];
  const managers = new Map<BootstrapInstallMethod, ResolvedPackageManager>();
  if (!classifyBootstrapTarget(options.target).supported) {
    return {
      choices: [
        {
          id: "none",
          label: "Preview-only (automatic installation is unsupported here)",
          selected: true,
        },
      ],
      managers,
    };
  }
  if (options.target.platform === "darwin") {
    const brew = await options.dependencies.resolvePackageManager("brew", {
      environment: options.environment,
    });
    if (brew) {
      managers.set("homebrew", brew);
      choices.push({
        id: "homebrew",
        label: "Homebrew (recommended)",
        selected: true,
      });
    }
  }
  const npm = await options.dependencies.resolvePackageManager("npm", {
    environment: options.environment,
  });
  if (npm) {
    managers.set("npm", npm);
    choices.push({
      id: "npm",
      label: "Global npm exact-version install",
      selected: choices.length === 0,
    });
  }
  choices.push({
    id: "none",
    label: "Preview-only (no package installation)",
    selected: choices.length === 0,
  });
  return { choices, managers };
}

async function chooseOneMethod(
  prompter: SetupPrompter,
  methods: readonly { id: BootstrapInstallMethod; label: string; selected: boolean }[],
): Promise<PromptOutcome<BootstrapInstallMethod>> {
  while (true) {
    const selection = await prompter.multiselect(
      "Choose a durable installation method",
      methods,
    );
    if (selection.status === "cancelled") return selection;
    if (selection.value.length === 1) {
      return {
        status: "value",
        value: selection.value[0] as BootstrapInstallMethod,
      };
    }
    prompter.note("Choose exactly one installation method.");
  }
}

function createPlan(
  request: SetupRequest,
  installMethod: BootstrapInstallMethod,
  options: BootstrapInitOptions,
  packageManagerPath?: string,
): BootstrapPlan {
  return createBootstrapPlan({
    exactVersion: options.exactVersion,
    ephemeralInvocationPath: options.invocationPath,
    target: options.target,
    installMethod,
    ...(packageManagerPath ? { packageManagerPath } : {}),
    providers: request.providers ?? [],
    notifications: request.notifications ?? [],
    providerTargets: providerTargets(
      request.providers ?? [],
      request.homeDirectory ?? options.defaultHomeDirectory,
    ),
    ...(options.homebrewFormulaInstalled === undefined
      ? {}
      : { homebrewFormulaInstalled: options.homebrewFormulaInstalled }),
  });
}

function renderBootstrapPlan(plan: BootstrapPlan, prompter: SetupPrompter): void {
  prompter.note("Bootstrap preview");
  if (!plan.installer.command) {
    prompter.note("Preview-only: no installer command will run.");
    return;
  }
  prompter.note(
    `${plan.installer.command.executablePath} ${plan.installer.command.arguments.join(" ")}`,
  );
  prompter.note(
    "Provider actions and launch commands remain deferred until the durable executable is validated.",
  );
}

function providerTargets(
  providers: readonly string[],
  homeDirectory: string,
) {
  const targets: Readonly<Record<string, string>> = {
    claude: path.join(homeDirectory, ".claude", "settings.json"),
    codex: path.join(homeDirectory, ".codex", "hooks.json"),
    gemini: path.join(homeDirectory, ".gemini", "settings.json"),
    opencode: path.join(
      homeDirectory,
      ".config",
      "opencode",
      "plugins",
      "side-glance.js",
    ),
  };
  return providers.map((provider) => ({
    provider: provider as "claude" | "codex" | "gemini" | "opencode",
    configPath: targets[provider] as string,
  }));
}

function stripBootstrapOptions(args: readonly string[]): string[] {
  const delegated: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--install") {
      index += 1;
      continue;
    }
    delegated.push(args[index] as string);
  }
  return delegated;
}

function renderBootstrapError(
  error: unknown,
  json: boolean,
  options: BootstrapInitOptions,
): number {
  if (error instanceof BootstrapError) {
    if (json) options.writeStdout(`${JSON.stringify(error.projection)}\n`);
    else {
      options.writeStderr(`side-glance: ${error.message}\n`);
      renderHumanCleanup(error, options);
    }
    return error.code === "interrupted" ? 130 : 1;
  }
  return writeBootstrapFailure(options, json, "bootstrap-failed");
}

function renderHumanCleanup(
  error: BootstrapError,
  options: BootstrapInitOptions,
): void {
  const cleanup = error.projection.cleanup;
  if (!cleanup) return;
  if (!cleanup.command) {
    options.writeStderr(
      "The Homebrew upgrade remains installed; no automatic downgrade command is available.\n",
    );
    return;
  }
  const command = [
    cleanup.command.executablePath,
    ...cleanup.command.arguments,
  ]
    .map(displayCommandArgument)
    .join(" ");
  options.writeStderr(
    `The package remains installed. Cleanup if desired: ${command}\n`,
  );
}

function displayCommandArgument(value: string): string {
  return /^[A-Za-z0-9_./:@%+=,-]+$/u.test(value)
    ? value
    : `'${value.replaceAll("'", `'"'"'`)}'`;
}

function writeBootstrapFailure(
  options: BootstrapInitOptions,
  json: boolean,
  code: string,
): number {
  if (json) {
    options.writeStdout(
      `${JSON.stringify({
        schemaVersion: 1,
        kind: "bootstrap-error",
        code,
        installMethod: "none",
        packageInstalled: false,
        setupApplied: false,
      })}\n`,
    );
  } else {
    options.writeStderr(
      "side-glance: Bootstrap options are incomplete or invalid. Use --install with fully specified automation, or run interactively.\n",
    );
  }
  return 1;
}

function cancellationCode(outcome: PromptOutcome<unknown>): 0 | 130 {
  return outcome.status === "cancelled" && outcome.reason === "signal" ? 130 : 0;
}
