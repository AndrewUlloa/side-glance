import path from "node:path";

import {
  captureExecutableIdentity,
  findDurableExecutableOnPath,
  isPathWithinConfiguredNpmCache,
  revalidateExecutableIdentity,
  sanitizeDelegatedEnvironment,
  type ExecutableFileSystem,
  type ExecutableIdentityToken,
  type FindDurableExecutableOptions,
  type ValidatedDurableExecutable,
} from "./executable.ts";
import { SETUP_PROVIDERS, type SetupProvider } from "./setup.ts";

const HOMEBREW_FORMULA = "AndrewUlloa/tap/side-glance";
const DEFAULT_CHILD_TIMEOUT_MS = 120_000;
const DEFAULT_CHILD_OUTPUT_BYTES = 8_192;
const CONTROL_CHARACTER = /\p{Cc}/u;
const EXACT_PACKAGE_VERSION =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u;
const NPM_CACHE_SEGMENT = /(?:^|[/\\])_npx(?:[/\\]|$)/u;
const HOMEBREW_CELLAR_SEGMENT = /(?:^|[/\\])Cellar(?:[/\\]|$)/u;

export interface BootstrapTarget {
  readonly platform: string;
  readonly arch: string;
  readonly libc?: "glibc" | "musl" | "unknown";
}

export type BootstrapTargetClassification =
  | { readonly supported: true; readonly experimental: boolean }
  | {
      readonly supported: false;
      readonly experimental: false;
      readonly reason:
        | "unsupported-platform"
        | "unsupported-architecture"
        | "unsupported-libc";
    };

export type BootstrapInstallMethod = "homebrew" | "npm" | "none";

export interface BootstrapProviderTarget {
  readonly provider: SetupProvider;
  readonly configPath: string;
}

export interface BootstrapInstallerCommand {
  readonly executablePath: string;
  readonly arguments: readonly string[];
}

export interface CreateBootstrapPlanOptions {
  readonly exactVersion: string;
  readonly ephemeralInvocationPath: string;
  readonly target: BootstrapTarget;
  readonly installMethod: BootstrapInstallMethod;
  readonly packageManagerPath?: string;
  readonly homebrewFormulaInstalled?: boolean;
  readonly providers: readonly SetupProvider[];
  readonly notifications: readonly SetupProvider[];
  readonly providerTargets: readonly BootstrapProviderTarget[];
}

export interface BootstrapPlan {
  readonly schemaVersion: 1;
  readonly kind: "bootstrap-plan";
  readonly ephemeralRunner: {
    readonly invocationPath: string;
    readonly version: string;
  };
  readonly durableExecutable: { readonly status: "pending" };
  readonly target: {
    readonly platform: string;
    readonly arch: string;
    readonly supported: boolean;
    readonly experimental: boolean;
    readonly reason?: string;
  };
  readonly installer: {
    readonly method: BootstrapInstallMethod;
    readonly command: BootstrapInstallerCommand | null;
  };
  readonly requested: {
    readonly providers: readonly SetupProvider[];
    readonly notifications: readonly SetupProvider[];
  };
  readonly providerActions: readonly {
    readonly provider: SetupProvider;
    readonly configPath: string;
    readonly action: "deferred";
  }[];
  readonly launchCommands: "deferred";
}

export interface ResolvedPackageManager {
  readonly name: "brew" | "npm";
  readonly invocationPath: string;
  readonly realPath: string;
  readonly identity: ExecutableIdentityToken;
}

export interface ResolvePackageManagerOptions {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly cwd?: string;
  readonly fileSystem?: ExecutableFileSystem;
}

export interface BootstrapCommandRequest {
  readonly executablePath: string;
  readonly arguments: readonly string[];
  readonly shell: false;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly stdio: "inherit" | "capture";
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly signal?: AbortSignal;
}

export interface BootstrapCommandResult {
  readonly exitCode: number | null;
  readonly signal?: NodeJS.Signals;
  readonly stdout?: string | Uint8Array;
  readonly stderr?: string | Uint8Array;
  readonly timedOut?: boolean;
  readonly outputExceeded?: boolean;
  readonly aborted?: boolean;
}

export type BootstrapCommandRunner = (
  request: BootstrapCommandRequest,
) => Promise<BootstrapCommandResult>;

export interface BootstrapExecutionDependencies {
  readonly findDurableExecutable: (
    options: FindDurableExecutableOptions,
  ) => Promise<ValidatedDurableExecutable | undefined>;
  readonly resolvePackageManager: (
    name: "brew" | "npm",
    options: ResolvePackageManagerOptions,
  ) => Promise<ResolvedPackageManager | undefined>;
  readonly revalidateExecutable: (
    identity: ExecutableIdentityToken,
    options?: {
      readonly environment?: Readonly<Record<string, string | undefined>>;
      readonly cwd?: string;
    },
  ) => Promise<void>;
  readonly runCommand: BootstrapCommandRunner;
}

export interface ExecuteBootstrapOptions
  extends Omit<CreateBootstrapPlanOptions, "packageManagerPath"> {
  readonly currentRunnerIdentity: ExecutableIdentityToken;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly cwd?: string;
  readonly dryRun: boolean;
  readonly json: boolean;
  readonly delegatedSetupArguments: readonly string[];
  readonly initialDurableExecutable?: ValidatedDurableExecutable | null;
  readonly dependencies?: Partial<BootstrapExecutionDependencies>;
  readonly childTimeoutMs?: number;
  readonly maxChildOutputBytes?: number;
  readonly signal?: AbortSignal;
}

export interface BootstrapChildStatus {
  readonly exitCode: number | null;
  readonly signal?: NodeJS.Signals;
  readonly timedOut?: true;
  readonly outputExceeded?: true;
  readonly aborted?: true;
}

export interface BootstrapDelegatedResult {
  readonly kind: "setup-plan" | "setup-result" | "setup-error";
  readonly schemaVersion?: 1;
  readonly v?: 1;
  readonly [key: string]: unknown;
}

export interface BootstrapDelegatedStatus extends BootstrapChildStatus {
  readonly result?: BootstrapDelegatedResult;
}

export interface BootstrapResult {
  readonly schemaVersion: 1;
  readonly kind: "bootstrap-result";
  readonly ephemeralRunner: {
    readonly invocationPath: string;
    readonly version: string;
  };
  readonly durableExecutable: {
    readonly invocationPath: string;
    readonly version: string;
  };
  readonly installMethod: "existing" | Exclude<BootstrapInstallMethod, "none">;
  readonly packageInstalled: boolean;
  readonly setupApplied: boolean | "unknown";
  readonly installer?: BootstrapChildStatus;
  readonly delegatedSetup: BootstrapDelegatedStatus;
}

export type BootstrapCleanup =
  | {
      readonly kind: "npm-global-package-retained";
      readonly command: BootstrapInstallerCommand;
    }
  | {
      readonly kind: "homebrew-install-retained";
      readonly command: BootstrapInstallerCommand;
    }
  | {
      readonly kind: "homebrew-upgrade-retained";
      readonly command: null;
    };

export type BootstrapErrorCode =
  | "invalid-options"
  | "unsupported-target"
  | "install-required"
  | "method-unavailable"
  | "package-manager-unavailable"
  | "installer-failed"
  | "post-install-validation-failed"
  | "homebrew-version-lag"
  | "interrupted"
  | "delegated-setup-failed";

export interface BootstrapErrorProjection {
  readonly schemaVersion: 1;
  readonly kind: "bootstrap-error";
  readonly code: BootstrapErrorCode;
  readonly installMethod: "existing" | BootstrapInstallMethod;
  readonly packageInstalled: boolean;
  readonly setupApplied: false;
  readonly child?: BootstrapChildStatus;
  readonly cleanup?: BootstrapCleanup;
}

export class BootstrapError extends Error {
  readonly code: BootstrapErrorCode;
  readonly projection: BootstrapErrorProjection;

  constructor(
    code: BootstrapErrorCode,
    message: string,
    projection: Omit<BootstrapErrorProjection, "schemaVersion" | "kind" | "code">,
  ) {
    super(message);
    this.name = "BootstrapError";
    this.code = code;
    this.projection = {
      schemaVersion: 1,
      kind: "bootstrap-error",
      code,
      ...projection,
    };
  }

  toJSON(): BootstrapErrorProjection {
    return this.projection;
  }
}

const defaultDependencies: BootstrapExecutionDependencies = {
  findDurableExecutable: findDurableExecutableOnPath,
  resolvePackageManager: resolvePackageManagerOnPath,
  revalidateExecutable: (identity, options) =>
    revalidateExecutableIdentity(identity, options),
  runCommand: async () => {
    throw new Error("A bootstrap command runner must be provided before execution.");
  },
};

export function classifyBootstrapTarget(
  target: BootstrapTarget,
): BootstrapTargetClassification {
  if (target.platform === "darwin") {
    if (target.arch !== "arm64" && target.arch !== "x64") {
      return unsupportedTarget("unsupported-architecture");
    }
    return { supported: true, experimental: target.arch === "x64" };
  }
  if (target.platform === "linux") {
    if (target.arch !== "arm64" && target.arch !== "x64") {
      return unsupportedTarget("unsupported-architecture");
    }
    if (target.libc !== "glibc") {
      return unsupportedTarget("unsupported-libc");
    }
    return { supported: true, experimental: false };
  }
  return unsupportedTarget("unsupported-platform");
}

export function detectBootstrapTarget(): BootstrapTarget {
  const target: BootstrapTarget = {
    platform: process.platform,
    arch: process.arch,
  };
  if (process.platform !== "linux") return target;
  const report = process.report?.getReport() as
    | { readonly header?: { readonly glibcVersionRuntime?: unknown } }
    | string
    | undefined;
  const header =
    typeof report === "object" && report !== null
      ? report.header
      : undefined;
  return {
    ...target,
    libc:
      typeof header?.glibcVersionRuntime === "string" ? "glibc" : "unknown",
  };
}

export function buildNpmInstallArguments(exactVersion: string): readonly string[] {
  validateExactVersion(exactVersion);
  return [
    "install",
    "--global",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    `side-glance@${exactVersion}`,
  ];
}

export function buildHomebrewInstallArguments(
  formulaInstalled: boolean,
): readonly string[] {
  return [formulaInstalled ? "upgrade" : "install", HOMEBREW_FORMULA];
}

export function createBootstrapPlan(
  options: CreateBootstrapPlanOptions,
): BootstrapPlan {
  validateExactVersion(options.exactVersion);
  const ephemeralInvocationPath = validateSafeAbsolutePath(
    options.ephemeralInvocationPath,
    "temporary Side Glance executable",
  );
  const classification = classifyBootstrapTarget(options.target);
  const providers = canonicalProviders(options.providers, "provider selection");
  const notifications = canonicalProviders(
    options.notifications,
    "notification selection",
  );
  const selected = new Set(providers);
  if (notifications.some((provider) => !selected.has(provider))) {
    throw new Error("Bootstrap notifications must be a subset of providers.");
  }
  const targets = canonicalProviderTargets(options.providerTargets, providers);
  const command = bootstrapInstallerCommand(options);
  const projectedTarget: BootstrapPlan["target"] = {
    platform: options.target.platform,
    arch: options.target.arch,
    supported: classification.supported,
    experimental: classification.experimental,
    ...(!classification.supported && { reason: classification.reason }),
  };
  return {
    schemaVersion: 1,
    kind: "bootstrap-plan",
    ephemeralRunner: {
      invocationPath: ephemeralInvocationPath,
      version: options.exactVersion,
    },
    durableExecutable: { status: "pending" },
    target: projectedTarget,
    installer: { method: options.installMethod, command },
    requested: { providers, notifications },
    providerActions: targets.map(({ provider, configPath }) => ({
      provider,
      configPath,
      action: "deferred",
    })),
    launchCommands: "deferred",
  };
}

export async function resolvePackageManagerOnPath(
  name: "brew" | "npm",
  options: ResolvePackageManagerOptions,
): Promise<ResolvedPackageManager | undefined> {
  const cwd = options.cwd ?? process.cwd();
  const sanitized = sanitizeDelegatedEnvironment(options.environment, cwd);
  const visited = new Set<string>();
  for (const directory of (sanitized.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    const invocationPath = path.resolve(cwd, directory, name);
    if (visited.has(invocationPath) || NPM_CACHE_SEGMENT.test(invocationPath)) {
      continue;
    }
    visited.add(invocationPath);
    try {
      const identity = await captureExecutableIdentity(
        invocationPath,
        options.fileSystem,
      );
      if (
        NPM_CACHE_SEGMENT.test(identity.realPath) ||
        (await isPathWithinConfiguredNpmCache(
          identity.realPath,
          options.environment,
          options.fileSystem,
          cwd,
        ))
      ) {
        continue;
      }
      return {
        name,
        invocationPath: identity.invocationPath,
        realPath: identity.realPath,
        identity,
      };
    } catch {
      // An unsafe PATH shadow must not hide a later trusted executable.
    }
  }
  return undefined;
}

export async function executeBootstrap(
  options: ExecuteBootstrapOptions,
): Promise<BootstrapPlan | BootstrapResult | BootstrapDelegatedResult> {
  validateExecutionOptions(options);
  const dependencies: BootstrapExecutionDependencies = {
    ...defaultDependencies,
    ...options.dependencies,
  };
  const cwd = options.cwd ?? process.cwd();
  const environment = sanitizeDelegatedEnvironment(options.environment, cwd);
  const findOptions: FindDurableExecutableOptions = {
    expectedVersion: options.exactVersion,
    environment,
    currentRunnerIdentity: options.currentRunnerIdentity,
    cwd,
  };
  const existing =
    options.initialDurableExecutable === undefined
      ? await dependencies.findDurableExecutable(findOptions)
      : (options.initialDurableExecutable ?? undefined);
  if (existing) {
    return delegateToDurable({
      options,
      dependencies,
      environment,
      durable: existing,
      installMethod: "existing",
      packageInstalled: false,
    });
  }

  if (options.installMethod === "none") {
    if (!options.dryRun) {
      throw bootstrapError(
        "install-required",
        "A durable Side Glance installation is required before setup can run.",
        "none",
        false,
      );
    }
    return createBootstrapPlan(options);
  }

  const classification = classifyBootstrapTarget(options.target);
  if (!classification.supported) {
    throw bootstrapError(
      "unsupported-target",
      "Automatic Side Glance installation is unavailable on this platform target.",
      options.installMethod,
      false,
    );
  }
  if (options.installMethod === "homebrew" && options.target.platform !== "darwin") {
    throw bootstrapError(
      "method-unavailable",
      "Homebrew bootstrap is available only on supported macOS targets.",
      options.installMethod,
      false,
    );
  }

  const managerName = options.installMethod === "homebrew" ? "brew" : "npm";
  const manager = await dependencies.resolvePackageManager(managerName, {
    environment,
    cwd,
  });
  if (!manager) {
    throw bootstrapError(
      "package-manager-unavailable",
      "The explicitly selected package manager is not available from a trusted PATH entry.",
      options.installMethod,
      false,
    );
  }

  if (options.dryRun) {
    await revalidateForSpawn(
      dependencies,
      manager.identity,
      environment,
      cwd,
      options.installMethod,
      false,
    );
    return createBootstrapPlan({
      ...options,
      packageManagerPath: manager.invocationPath,
    });
  }

  await revalidateForSpawn(
    dependencies,
    manager.identity,
    environment,
    cwd,
    options.installMethod,
    false,
  );
  const installRequest = commandRequest(
    manager.invocationPath,
    options.installMethod === "npm"
      ? buildNpmInstallArguments(options.exactVersion)
      : buildHomebrewInstallArguments(options.homebrewFormulaInstalled ?? false),
    environment,
    options,
  );
  const installResult = await safelyRunCommand(
    dependencies,
    installRequest,
    options.installMethod,
    false,
  );
  const installStatus = boundedChildStatus(installResult, installRequest.maxOutputBytes);
  if (installStatus.aborted) {
    throw bootstrapError(
      "interrupted",
      "The Side Glance installation command was interrupted.",
      options.installMethod,
      false,
      { child: installStatus },
    );
  }
  if (!childSucceeded(installStatus)) {
    throw bootstrapError(
      "installer-failed",
      "The selected package manager did not complete successfully.",
      options.installMethod,
      false,
      { child: installStatus },
    );
  }

  const postInstallFindOptions: FindDurableExecutableOptions =
    options.installMethod === "homebrew"
      ? {
          ...findOptions,
          environment: {
            ...environment,
            PATH: path.dirname(manager.invocationPath),
          },
        }
      : findOptions;
  let durable = await dependencies.findDurableExecutable(postInstallFindOptions);
  if (
    durable &&
    options.installMethod === "homebrew" &&
    !isStableHomebrewExecutable(durable, manager)
  ) {
    durable = undefined;
  }
  if (!durable) {
    const cleanup = retainedPackageCleanup(
      options.installMethod,
      manager,
      options.homebrewFormulaInstalled ?? false,
    );
    const code =
      options.installMethod === "homebrew"
        ? "homebrew-version-lag"
        : "post-install-validation-failed";
    const message =
      options.installMethod === "homebrew"
        ? "The installed Homebrew formula did not expose the exact requested Side Glance version. Provider setup was not run."
        : "The installed package did not expose a durable exact-version Side Glance executable. Provider setup was not run.";
    throw bootstrapError(code, message, options.installMethod, true, { cleanup });
  }

  return delegateToDurable({
    options,
    dependencies,
    environment,
    durable,
    installMethod: options.installMethod,
    packageInstalled: true,
    installer: installStatus,
    cleanup: retainedPackageCleanup(
      options.installMethod,
      manager,
      options.homebrewFormulaInstalled ?? false,
    ),
  });
}

function isStableHomebrewExecutable(
  durable: ValidatedDurableExecutable,
  manager: ResolvedPackageManager,
): boolean {
  const expected = path.join(path.dirname(manager.invocationPath), "side-glance");
  return (
    path.normalize(durable.invocationPath) === path.normalize(expected) &&
    !HOMEBREW_CELLAR_SEGMENT.test(durable.invocationPath)
  );
}

async function delegateToDurable(input: {
  readonly options: ExecuteBootstrapOptions;
  readonly dependencies: BootstrapExecutionDependencies;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly durable: ValidatedDurableExecutable;
  readonly installMethod: "existing" | Exclude<BootstrapInstallMethod, "none">;
  readonly packageInstalled: boolean;
  readonly installer?: BootstrapChildStatus;
  readonly cleanup?: BootstrapCleanup;
}): Promise<BootstrapResult | BootstrapDelegatedResult> {
  const arguments_ = buildDelegatedSetupArguments(
    input.options.delegatedSetupArguments,
    input.durable.invocationPath,
  );
  await revalidateForSpawn(
    input.dependencies,
    input.durable.identity,
    input.environment,
    input.options.cwd ?? process.cwd(),
    input.installMethod,
    input.packageInstalled,
    input.cleanup,
  );
  const request = commandRequest(
    input.durable.invocationPath,
    arguments_,
    input.environment,
    input.options,
  );
  const result = await safelyRunCommand(
    input.dependencies,
    request,
    input.installMethod,
    input.packageInstalled,
    input.cleanup,
  );
  const status = boundedChildStatus(result, request.maxOutputBytes);
  if (
    status.aborted ||
    !status.timedOut &&
    !status.outputExceeded &&
    (status.exitCode === 130 || status.signal === "SIGINT")
  ) {
    throw bootstrapError(
      "interrupted",
      "The durable Side Glance setup command was interrupted.",
      input.installMethod,
      input.packageInstalled,
      { child: status, cleanup: input.cleanup },
    );
  }
  if (!childSucceeded(status)) {
    throw bootstrapError(
      "delegated-setup-failed",
      "The durable Side Glance setup command did not complete successfully.",
      input.installMethod,
      input.packageInstalled,
      { child: status, cleanup: input.cleanup },
    );
  }
  let delegatedResult: BootstrapDelegatedResult | undefined;
  if (input.options.json && result.stdout !== undefined) {
    try {
      delegatedResult = parseDelegatedResult(result.stdout);
    } catch {
      throw bootstrapError(
        "delegated-setup-failed",
        "The durable Side Glance setup command returned an invalid machine result.",
        input.installMethod,
        input.packageInstalled,
        { child: status, cleanup: input.cleanup },
      );
    }
  }
  if (input.options.dryRun && input.options.json) {
    if (delegatedResult?.kind !== "setup-plan") {
      throw bootstrapError(
        "delegated-setup-failed",
        "The durable Side Glance dry-run did not return an authoritative setup plan.",
        input.installMethod,
        input.packageInstalled,
        { child: status, cleanup: input.cleanup },
      );
    }
    return delegatedResult;
  }
  if (input.options.json && delegatedResult?.kind !== "setup-result") {
    throw bootstrapError(
      "delegated-setup-failed",
      "The durable Side Glance setup command did not return a verified setup result.",
      input.installMethod,
      input.packageInstalled,
      { child: status, cleanup: input.cleanup },
    );
  }
  return {
    schemaVersion: 1,
    kind: "bootstrap-result",
    ephemeralRunner: {
      invocationPath: input.options.ephemeralInvocationPath,
      version: input.options.exactVersion,
    },
    durableExecutable: {
      invocationPath: input.durable.invocationPath,
      version: input.durable.version,
    },
    installMethod: input.installMethod,
    packageInstalled: input.packageInstalled,
    setupApplied: input.options.json ? true : "unknown",
    ...(input.installer && { installer: input.installer }),
    delegatedSetup: {
      ...status,
      ...(delegatedResult && { result: delegatedResult }),
    },
  };
}

function buildDelegatedSetupArguments(
  arguments_: readonly string[],
  durableInvocationPath: string,
): readonly string[] {
  if (arguments_.length > 128) {
    throw bootstrapError(
      "invalid-options",
      "Too many setup arguments were provided for durable handoff.",
      "existing",
      false,
    );
  }
  for (const argument of arguments_) {
    if (
      argument.length === 0 ||
      argument.length > 4_096 ||
      CONTROL_CHARACTER.test(argument) ||
      argument === "--install" ||
      argument.startsWith("--install=") ||
      argument === "--executable" ||
      argument.startsWith("--executable=")
    ) {
      throw bootstrapError(
        "invalid-options",
        "Bootstrap-only or unsafe options cannot enter durable setup handoff.",
        "existing",
        false,
      );
    }
  }
  return ["init", ...arguments_, "--executable", durableInvocationPath];
}

function bootstrapInstallerCommand(
  options: CreateBootstrapPlanOptions,
): BootstrapInstallerCommand | null {
  if (options.installMethod === "none") return null;
  if (!options.packageManagerPath) {
    throw new Error("A resolved package-manager path is required for bootstrap planning.");
  }
  const executablePath = validateSafeAbsolutePath(
    options.packageManagerPath,
    "package manager",
  );
  return {
    executablePath,
    arguments:
      options.installMethod === "npm"
        ? buildNpmInstallArguments(options.exactVersion)
        : buildHomebrewInstallArguments(options.homebrewFormulaInstalled ?? false),
  };
}

function canonicalProviders(
  providers: readonly SetupProvider[],
  label: string,
): readonly SetupProvider[] {
  const selected = new Set<SetupProvider>();
  for (const provider of providers) {
    if (!SETUP_PROVIDERS.includes(provider)) {
      throw new Error(`The bootstrap ${label} contains an unknown provider.`);
    }
    if (selected.has(provider)) {
      throw new Error(`The bootstrap ${label} contains a duplicate provider.`);
    }
    selected.add(provider);
  }
  return SETUP_PROVIDERS.filter((provider) => selected.has(provider));
}

function canonicalProviderTargets(
  targets: readonly BootstrapProviderTarget[],
  providers: readonly SetupProvider[],
): readonly BootstrapProviderTarget[] {
  const byProvider = new Map<SetupProvider, string>();
  const selected = new Set(providers);
  for (const target of targets) {
    if (
      !SETUP_PROVIDERS.includes(target.provider) ||
      !selected.has(target.provider)
    ) {
      throw new Error("The bootstrap plan contains an unselected provider target.");
    }
    if (byProvider.has(target.provider)) {
      throw new Error("The bootstrap plan contains a duplicate provider target.");
    }
    byProvider.set(
      target.provider,
      validateSafeAbsolutePath(target.configPath, "provider configuration target"),
    );
  }
  return providers.map((provider) => {
    const configPath = byProvider.get(provider);
    if (!configPath) {
      throw new Error("The bootstrap plan is missing a selected provider target.");
    }
    return { provider, configPath };
  });
}

function validateExecutionOptions(options: ExecuteBootstrapOptions): void {
  try {
    validateExactVersion(options.exactVersion);
    validateSafeAbsolutePath(
      options.ephemeralInvocationPath,
      "temporary Side Glance executable",
    );
    validatedPositiveBound(options.childTimeoutMs ?? DEFAULT_CHILD_TIMEOUT_MS);
    validatedPositiveBound(
      options.maxChildOutputBytes ?? DEFAULT_CHILD_OUTPUT_BYTES,
    );
    buildDelegatedSetupArguments(
      options.delegatedSetupArguments,
      "/side-glance-bootstrap-validation",
    );
    const providers = canonicalProviders(options.providers, "provider selection");
    const notifications = canonicalProviders(
      options.notifications,
      "notification selection",
    );
    const selected = new Set(providers);
    if (notifications.some((provider) => !selected.has(provider))) {
      throw new Error("Bootstrap notifications must be a subset of providers.");
    }
    canonicalProviderTargets(options.providerTargets, providers);
  } catch {
    throw bootstrapError(
      "invalid-options",
      "The bootstrap options are invalid.",
      options.installMethod,
      false,
    );
  }
}

function commandRequest(
  executablePath: string,
  arguments_: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
  options: ExecuteBootstrapOptions,
): BootstrapCommandRequest {
  return {
    executablePath,
    arguments: arguments_,
    shell: false,
    environment,
    stdio: options.json ? "capture" : "inherit",
    timeoutMs: options.childTimeoutMs ?? DEFAULT_CHILD_TIMEOUT_MS,
    maxOutputBytes: options.maxChildOutputBytes ?? DEFAULT_CHILD_OUTPUT_BYTES,
    ...(options.signal ? { signal: options.signal } : {}),
  };
}

async function safelyRunCommand(
  dependencies: BootstrapExecutionDependencies,
  request: BootstrapCommandRequest,
  installMethod: "existing" | Exclude<BootstrapInstallMethod, "none">,
  packageInstalled: boolean,
  cleanup?: BootstrapCleanup,
): Promise<BootstrapCommandResult> {
  try {
    return await dependencies.runCommand(request);
  } catch {
    throw bootstrapError(
      request.arguments[0] === "init"
        ? "delegated-setup-failed"
        : "installer-failed",
      request.arguments[0] === "init"
        ? "The durable Side Glance setup command could not be started."
        : "The selected package manager command could not be started.",
      installMethod,
      packageInstalled,
      { cleanup },
    );
  }
}

function boundedChildStatus(
  result: BootstrapCommandResult,
  maxOutputBytes: number,
): BootstrapChildStatus {
  const outputExceeded =
    result.outputExceeded === true ||
    outputByteLength(result.stdout) + outputByteLength(result.stderr) >
      maxOutputBytes;
  return {
    exitCode: result.exitCode,
    ...(result.signal && { signal: result.signal }),
    ...(result.timedOut && { timedOut: true }),
    ...(outputExceeded && { outputExceeded: true }),
    ...(result.aborted && { aborted: true }),
  };
}

function outputByteLength(value: string | Uint8Array | undefined): number {
  if (value === undefined) return 0;
  return typeof value === "string" ? Buffer.byteLength(value) : value.byteLength;
}

function parseDelegatedResult(
  value: string | Uint8Array,
): BootstrapDelegatedResult {
  const text =
    typeof value === "string"
      ? value
      : new TextDecoder("utf-8", { fatal: true }).decode(value);
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) {
    throw new Error("Delegated setup JSON must be an object.");
  }
  if (parsed.schemaVersion !== 1) {
    throw new Error("Delegated setup JSON is not a versioned setup result.");
  }
  if (parsed.kind === "setup-plan") return projectDelegatedPlan(parsed);
  if (parsed.kind === "setup-result") return projectDelegatedSetupResult(parsed);
  if (parsed.kind === "setup-error") return projectDelegatedError(parsed);
  throw new Error("Delegated setup JSON has an unsupported result kind.");
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function projectDelegatedPlan(
  value: Readonly<Record<string, unknown>>,
): BootstrapDelegatedResult {
  assertAllowedKeys(value, [
    "schemaVersion",
    "kind",
    "mode",
    "executablePath",
    "providers",
    "notificationSound",
    "guidance",
  ]);
  return {
    schemaVersion: 1,
    kind: "setup-plan",
    ...optionalEnumField(value, "mode", ["dry-run", "apply"]),
    ...optionalSafeStringField(value, "executablePath", 4_096),
    ...(value.providers === undefined
      ? {}
      : {
          providers: projectArray(value.providers, 4, projectDelegatedPlanProvider),
        }),
    ...optionalNullableSafeStringField(value, "notificationSound", 160),
    ...(value.guidance === undefined
      ? {}
      : { guidance: projectArray(value.guidance, 8, projectDelegatedGuidance) }),
  };
}

function projectDelegatedSetupResult(
  value: Readonly<Record<string, unknown>>,
): BootstrapDelegatedResult {
  assertAllowedKeys(value, [
    "schemaVersion",
    "kind",
    "executablePath",
    "providers",
    "notificationSound",
    "guidance",
  ]);
  return {
    schemaVersion: 1,
    kind: "setup-result",
    ...optionalSafeStringField(value, "executablePath", 4_096),
    ...(value.providers === undefined
      ? {}
      : {
          providers: projectArray(
            value.providers,
            4,
            projectDelegatedResultProvider,
          ),
        }),
    ...optionalNullableSafeStringField(value, "notificationSound", 160),
    ...(value.guidance === undefined
      ? {}
      : { guidance: projectArray(value.guidance, 8, projectDelegatedGuidance) }),
  };
}

function projectDelegatedError(
  value: Readonly<Record<string, unknown>>,
): BootstrapDelegatedResult {
  assertAllowedKeys(value, ["schemaVersion", "kind", "code"]);
  return {
    schemaVersion: 1,
    kind: "setup-error",
    code: requiredSafeString(value.code, 128),
  };
}

function projectDelegatedPlanProvider(value: unknown): Readonly<Record<string, unknown>> {
  const provider = requiredRecord(value);
  assertAllowedKeys(provider, [
    "id",
    "state",
    "maturity",
    "integrationStatus",
    "target",
    "notifications",
    "warnings",
    "legacyStoplight",
    "launchCommand",
  ]);
  return {
    id: requiredEnum(provider.id, SETUP_PROVIDERS),
    state: requiredEnum(provider.state, [
      "eligible",
      "blocked",
      "unavailable",
      "guidance-only",
    ]),
    maturity: requiredEnum(provider.maturity, [
      "contract-audited",
      "experimental",
    ]),
    integrationStatus: requiredEnum(provider.integrationStatus, [
      "installed",
      "partial",
      "not-installed",
      "unknown",
    ]),
    target: projectDelegatedTarget(provider.target),
    notifications: projectDelegatedNotifications(provider.notifications, true),
    warnings: projectArray(provider.warnings, 16, projectDelegatedWarning),
    legacyStoplight: projectDelegatedLegacyStoplight(provider.legacyStoplight),
    ...optionalSafeStringField(provider, "launchCommand", 4_096),
  };
}

function projectDelegatedResultProvider(
  value: unknown,
): Readonly<Record<string, unknown>> {
  const provider = requiredRecord(value);
  assertAllowedKeys(provider, [
    "id",
    "configPath",
    "changed",
    "backupPath",
    "integrationStatus",
    "verificationStatus",
    "maturity",
    "notifications",
    "warnings",
    "legacyStoplight",
    "launchCommand",
  ]);
  if (typeof provider.changed !== "boolean") {
    throw new Error("Delegated setup provider changed state is invalid.");
  }
  return {
    id: requiredEnum(provider.id, SETUP_PROVIDERS),
    changed: provider.changed,
    ...optionalSafeStringField(provider, "configPath", 4_096),
    ...optionalSafeStringField(provider, "backupPath", 4_096),
    ...optionalEnumField(provider, "integrationStatus", ["installed"]),
    ...optionalEnumField(provider, "verificationStatus", ["verified"]),
    ...optionalEnumField(provider, "maturity", [
      "contract-audited",
      "experimental",
    ]),
    ...(provider.notifications === undefined
      ? {}
      : {
          notifications: projectDelegatedNotifications(
            provider.notifications,
            false,
          ),
        }),
    ...(provider.warnings === undefined
      ? {}
      : { warnings: projectArray(provider.warnings, 16, projectDelegatedWarning) }),
    ...(provider.legacyStoplight === undefined
      ? {}
      : {
          legacyStoplight: projectDelegatedLegacyStoplight(
            provider.legacyStoplight,
          ),
        }),
    ...optionalSafeStringField(provider, "launchCommand", 4_096),
  };
}

function projectDelegatedLegacyStoplight(
  value: unknown,
): Readonly<Record<string, unknown>> {
  const legacy = requiredRecord(value);
  assertAllowedKeys(legacy, ["detectedHookCount", "migrated"]);
  if (
    typeof legacy.detectedHookCount !== "number" ||
    !Number.isSafeInteger(legacy.detectedHookCount) ||
    legacy.detectedHookCount < 0 ||
    legacy.detectedHookCount > 64 ||
    typeof legacy.migrated !== "boolean"
  ) {
    throw new Error("Delegated legacy Stoplight metadata is invalid.");
  }
  return {
    detectedHookCount: legacy.detectedHookCount,
    migrated: legacy.migrated,
  };
}

function projectDelegatedTarget(value: unknown): Readonly<Record<string, unknown>> {
  const target = requiredRecord(value);
  assertAllowedKeys(target, ["path", "action", "managedHookCount"]);
  if (
    typeof target.managedHookCount !== "number" ||
    !Number.isSafeInteger(target.managedHookCount) ||
    target.managedHookCount < 0 ||
    target.managedHookCount > 64
  ) {
    throw new Error("Delegated managed hook count is invalid.");
  }
  return {
    path: requiredSafeString(target.path, 4_096),
    action: requiredEnum(target.action, ["create", "update", "unchanged"]),
    managedHookCount: target.managedHookCount,
  };
}

function projectDelegatedNotifications(
  value: unknown,
  includeRecommendation: boolean,
): Readonly<Record<string, unknown>> {
  const notifications = requiredRecord(value);
  assertAllowedKeys(
    notifications,
    includeRecommendation
      ? ["selected", "nativeStatus", "recommendation", "coverage"]
      : ["selected", "nativeStatus", "coverage"],
  );
  if (typeof notifications.selected !== "boolean") {
    throw new Error("Delegated notification selection is invalid.");
  }
  return {
    selected: notifications.selected,
    nativeStatus: requiredEnum(notifications.nativeStatus, [
      "ready",
      "disabled",
      "not-configured",
      "unavailable",
      "unknown",
    ]),
    ...(includeRecommendation
      ? {
          recommendation: requiredEnum(notifications.recommendation, [
            "enable-side-glance",
            "prefer-native",
            "leave-off-unverified",
            "backend-unavailable",
            "unsupported",
          ]),
        }
      : {}),
    coverage: projectDelegatedCoverage(notifications.coverage),
  };
}

function projectDelegatedCoverage(value: unknown): Readonly<Record<string, unknown>> {
  const coverage = requiredRecord(value);
  assertAllowedKeys(coverage, ["ready", "attention", "failure"]);
  return {
    ready: requiredEnum(coverage.ready, ["covered", "pre-final-silent"]),
    attention: requiredEnum(coverage.attention, ["covered", "not-covered"]),
    failure: requiredEnum(coverage.failure, ["covered", "not-covered"]),
  };
}

function projectDelegatedWarning(value: unknown): Readonly<Record<string, unknown>> {
  const warning = requiredRecord(value);
  assertAllowedKeys(warning, ["code", "message"]);
  return {
    code: requiredSafeString(warning.code, 128),
    message: requiredSafeString(warning.message, 1_024),
  };
}

function projectDelegatedGuidance(value: unknown): Readonly<Record<string, unknown>> {
  const guidance = requiredRecord(value);
  assertAllowedKeys(guidance, ["kind", "state", "command", "message"]);
  return {
    kind: requiredEnum(guidance.kind, ["aider", "generic"]),
    state: requiredEnum(guidance.state, ["guidance-only"]),
    command: requiredSafeString(guidance.command, 4_096),
    message: requiredSafeString(guidance.message, 1_024),
  };
}

function projectArray<T>(
  value: unknown,
  maximumLength: number,
  project: (entry: unknown) => T,
): readonly T[] {
  if (!Array.isArray(value) || value.length > maximumLength) {
    throw new Error("Delegated setup array is invalid.");
  }
  return value.map((entry) => project(entry));
}

function requiredRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw new Error("Delegated setup field must be an object.");
  return value;
}

function assertAllowedKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): void {
  const allowedKeys = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new Error("Delegated setup JSON contains an unknown field.");
  }
}

function requiredEnum<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
): Value {
  if (typeof value !== "string" || !allowed.includes(value as Value)) {
    throw new Error("Delegated setup enum is invalid.");
  }
  return value as Value;
}

function requiredSafeString(value: unknown, maximumLength: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    [...value].length > maximumLength ||
    CONTROL_CHARACTER.test(value)
  ) {
    throw new Error("Delegated setup string is invalid.");
  }
  return value;
}

function optionalSafeStringField(
  value: Readonly<Record<string, unknown>>,
  key: string,
  maximumLength: number,
): Readonly<Record<string, string>> {
  return value[key] === undefined
    ? {}
    : { [key]: requiredSafeString(value[key], maximumLength) };
}

function optionalNullableSafeStringField(
  value: Readonly<Record<string, unknown>>,
  key: string,
  maximumLength: number,
): Readonly<Record<string, string | null>> {
  if (value[key] === undefined) return {};
  return {
    [key]:
      value[key] === null ? null : requiredSafeString(value[key], maximumLength),
  };
}

function optionalEnumField<const Value extends string>(
  value: Readonly<Record<string, unknown>>,
  key: string,
  allowed: readonly Value[],
): Readonly<Record<string, Value>> {
  return value[key] === undefined
    ? {}
    : { [key]: requiredEnum(value[key], allowed) };
}

function childSucceeded(status: BootstrapChildStatus): boolean {
  return status.exitCode === 0 && !status.timedOut && !status.outputExceeded;
}

function retainedPackageCleanup(
  installMethod: Exclude<BootstrapInstallMethod, "none">,
  manager: ResolvedPackageManager,
  homebrewFormulaInstalled: boolean,
): BootstrapCleanup {
  if (installMethod === "npm") {
    return {
      kind: "npm-global-package-retained",
      command: {
        executablePath: manager.invocationPath,
        arguments: ["uninstall", "--global", "side-glance"],
      },
    };
  }
  if (homebrewFormulaInstalled) {
    return { kind: "homebrew-upgrade-retained", command: null };
  }
  return {
    kind: "homebrew-install-retained",
    command: {
      executablePath: manager.invocationPath,
      arguments: ["uninstall", HOMEBREW_FORMULA],
    },
  };
}

async function revalidateForSpawn(
  dependencies: BootstrapExecutionDependencies,
  identity: ExecutableIdentityToken,
  environment: Readonly<Record<string, string | undefined>>,
  cwd: string,
  installMethod: "existing" | Exclude<BootstrapInstallMethod, "none">,
  packageInstalled: boolean,
  cleanup?: BootstrapCleanup,
): Promise<void> {
  try {
    await dependencies.revalidateExecutable(identity, { environment, cwd });
  } catch {
    throw bootstrapError(
      "invalid-options",
      "An approved executable changed before it could be started.",
      installMethod,
      packageInstalled,
      { cleanup },
    );
  }
}

function bootstrapError(
  code: BootstrapErrorCode,
  message: string,
  installMethod: "existing" | BootstrapInstallMethod,
  packageInstalled: boolean,
  details: {
    readonly child?: BootstrapChildStatus;
    readonly cleanup?: BootstrapCleanup;
  } = {},
): BootstrapError {
  return new BootstrapError(code, message, {
    installMethod,
    packageInstalled,
    setupApplied: false,
    ...(details.child && { child: details.child }),
    ...(details.cleanup && { cleanup: details.cleanup }),
  });
}

function validateExactVersion(exactVersion: string): void {
  if (!EXACT_PACKAGE_VERSION.test(exactVersion)) {
    throw new Error("A canonical exact version is required for bootstrap.");
  }
}

function validateSafeAbsolutePath(candidate: string, label: string): string {
  if (
    !path.isAbsolute(candidate) ||
    candidate.length > 4_096 ||
    CONTROL_CHARACTER.test(candidate)
  ) {
    throw new Error(`The ${label} path is invalid.`);
  }
  return path.normalize(candidate);
}

function validatedPositiveBound(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Bootstrap child-process bounds must be positive integers.");
  }
  return value;
}

function unsupportedTarget(
  reason: "unsupported-platform" | "unsupported-architecture" | "unsupported-libc",
): BootstrapTargetClassification {
  return { supported: false, experimental: false, reason };
}
