import path from "node:path";

import { MAX_NOTIFICATION_SOUND_CODE_POINTS } from "../notifications/policy.ts";
import {
  captureExecutableIdentity,
  detectEphemeralNpmExecution,
  revalidateExecutableIdentity,
  type ExecutableIdentityToken,
} from "../cli/executable.ts";
import {
  applyConfigTargetPlan,
  backupConfigTargetPlan,
  captureConfigTarget,
  planConfigTarget,
  planConfigTargetRemoval,
  revalidateConfigTargetPlan,
  restoreConfigTargetApplication,
  sensitiveConfigTargetSnapshotBytes,
  verifyConfigTargetApplication,
  verifyConfigTargetPlan,
  withConfigWriterLock,
  type ConfigTargetApplication,
  type ConfigTargetPlan,
  type ConfigTargetSnapshot,
} from "./config-target.ts";

const MANAGED_MARKER = "SIDE_GLANCE_MANAGED_HOOK=1";
const LEGACY_MANAGED_MARKER = "SIGNAL_MANAGED_HOOK=1";
const MAX_CONFIG_BYTES = 2 * 1_048_576;
const executableIdentities = new WeakMap<
  ProviderHookMutationPlan,
  ExecutableIdentityToken
>();

export type InstallableProvider = "claude" | "codex" | "gemini";

export interface InstallerOptions {
  provider: InstallableProvider;
  homeDirectory: string;
  executablePath: string;
  directSurface?: boolean;
  migrateLegacyStoplight?: boolean;
  notifications?: boolean;
  notificationSound?: string;
}

export interface InstallerResult {
  provider: InstallableProvider;
  configPath: string;
  changed: boolean;
  backupPath?: string;
  installedHooks: number;
}

export interface ProviderInspection {
  provider: InstallableProvider;
  configPath: string;
  exists: boolean;
  valid: true;
  expectedEvents: number;
  existingHookGroups: number;
  sideGlanceHooks: number;
  legacyStoplightHooks: number;
  integrationStatus: "installed" | "partial" | "not-installed";
  managedHooks: Array<{
    event: string;
    directSurfaceConfigured: boolean;
    notifications: boolean;
    soundConfigured: boolean;
    timeout: number | null;
    timeoutUnit: "seconds" | "milliseconds";
  }>;
  notifyConfigured?: boolean;
}

export interface ProviderHookMutationPlan {
  readonly provider: InstallableProvider;
  readonly operation: "install" | "uninstall";
  readonly configPath: string;
  readonly changed: boolean;
  readonly action: "create" | "update" | "unchanged";
  readonly installedHooks: number;
  readonly targetPlan: ConfigTargetPlan;
}

export interface ProviderHookMutationApplication {
  readonly result: InstallerResult;
  readonly targetApplication: ConfigTargetApplication;
}

interface HookCommand {
  type: string;
  command?: string;
  [key: string]: unknown;
}

interface HookGroup {
  hooks: HookCommand[];
  [key: string]: unknown;
}

type HookConfiguration = Record<string, HookGroup[]>;

const PROVIDER_EVENTS: Readonly<Record<InstallableProvider, readonly string[]>> = {
  claude: [
    "SessionStart",
    "UserPromptSubmit",
    "PermissionRequest",
    "Notification",
    "SubagentStart",
    "SubagentStop",
    "Stop",
    "StopFailure",
    "SessionEnd",
  ],
  codex: [
    "SessionStart",
    "UserPromptSubmit",
    "PermissionRequest",
    "Stop",
    "SessionEnd",
  ],
  gemini: [
    "SessionStart",
    "BeforeAgent",
    "AfterAgent",
    "Notification",
    "SessionEnd",
  ],
};

export async function inspectProviderHooks(options: {
  provider: InstallableProvider;
  homeDirectory: string;
}): Promise<ProviderInspection> {
  if (!path.isAbsolute(options.homeDirectory)) {
    throw new Error("Doctor home directory must be absolute.");
  }
  const homeDirectory = path.resolve(options.homeDirectory);
  const configPath = configPathFor(homeDirectory, options.provider);
  const loaded = await readConfiguration(homeDirectory, configPath);
  const hooks = readHooks(loaded.value);
  const groups = Object.values(hooks).flat();
  const legacyStoplightHooks =
    options.provider === "claude"
      ? countLegacyStoplightHooks(groups, homeDirectory)
      : 0;
  const managedHooks = Object.entries(hooks).flatMap(([event, eventGroups]) =>
    eventGroups.flatMap((group) =>
      group.hooks.flatMap((hook) => {
        if (!isManagedCommand(hook.command, options.provider)) return [];
        return [
          {
            event,
            directSurfaceConfigured:
              hasDirectSurfaceOption(hook.command, options.provider),
            notifications: hook.command?.includes(" --notifications") ?? false,
            soundConfigured:
              hook.command?.includes(" --notification-sound ") ?? false,
            timeout:
              typeof hook.timeout === "number" &&
              Number.isFinite(hook.timeout) &&
              hook.timeout > 0
                ? hook.timeout
                : null,
            timeoutUnit:
              options.provider === "gemini"
                ? ("milliseconds" as const)
                : ("seconds" as const),
          },
        ];
      }),
    ),
  );
  const providerEvents = PROVIDER_EVENTS[options.provider];
  const expectedEvents = providerEvents.length;
  const managedEvents = new Set(managedHooks.map(({ event }) => event));
  const inspection: ProviderInspection = {
    provider: options.provider,
    configPath,
    exists: loaded.exists,
    valid: true,
    expectedEvents,
    existingHookGroups: groups.length,
    sideGlanceHooks: managedHooks.length,
    legacyStoplightHooks,
    integrationStatus:
      providerEvents.every((event) => managedEvents.has(event))
        ? "installed"
        : managedHooks.length > 0
          ? "partial"
          : "not-installed",
    managedHooks,
  };
  if (options.provider === "codex") {
    inspection.notifyConfigured = await inspectCodexNotify(homeDirectory);
  }
  return inspection;
}

export async function installProviderHooks(
  options: InstallerOptions,
): Promise<InstallerResult> {
  return withConfigWriterLock(options.homeDirectory, () =>
    installProviderHooksUnlocked(options),
  );
}

export async function installProviderHooksUnlocked(
  options: InstallerOptions,
): Promise<InstallerResult> {
  const plan = await planProviderHookInstall(options);
  const applied = await applyProviderHookPlan(plan);
  try {
    await verifyProviderHookApplication(applied);
    return applied.result;
  } catch (error) {
    await restoreProviderHookApplication(applied).catch((rollbackError: unknown) => {
      throw new AggregateError(
        [error, rollbackError],
        "Provider hook verification failed and rollback encountered a conflict.",
      );
    });
    throw error;
  }
}

export async function planProviderHookInstall(
  options: InstallerOptions,
): Promise<ProviderHookMutationPlan> {
  const validated = await validateOptions(options, true);
  const homeDirectory = path.resolve(options.homeDirectory);
  const loaded = await readConfiguration(
    homeDirectory,
    validated.configPath,
  );
  const configuration = loaded.value;
  const hooks = readHooks(configuration);
  const legacyStoplightHooks =
    options.provider === "claude"
      ? countLegacyStoplightHooks(Object.values(hooks).flat(), homeDirectory)
      : 0;
  if (options.migrateLegacyStoplight && options.provider !== "claude") {
    throw new Error("Legacy Stoplight migration is supported only for Claude.");
  }
  if (options.migrateLegacyStoplight && !options.directSurface) {
    throw new Error("Legacy Stoplight migration requires direct terminal discovery.");
  }
  if (
    options.directSurface &&
    legacyStoplightHooks > 0 &&
    !options.migrateLegacyStoplight
  ) {
    throw new Error(
      "A legacy Stoplight visual hook is active; explicit migration is required before direct terminal discovery can be enabled.",
    );
  }
  if (options.migrateLegacyStoplight) {
    for (const [eventName, groups] of Object.entries(hooks)) {
      const retained = removeLegacyStoplightHandlers(
        groups,
        homeDirectory,
      );
      if (retained.length > 0) hooks[eventName] = retained;
      else delete hooks[eventName];
    }
  }
  const command = managedCommand(
    options.provider,
    validated.executablePath,
    options,
  );

  for (const eventName of PROVIDER_EVENTS[options.provider]) {
    const groups = hooks[eventName] ?? [];
    const withoutManagedHandlers = removeManagedHandlers(
      groups,
      options.provider,
    );
    withoutManagedHandlers.push({
      hooks: [managedHook(options.provider, eventName, command)],
    });
    hooks[eventName] = withoutManagedHandlers;
  }
  configuration.hooks = hooks;

  const serialized = serializeConfiguration(configuration);
  const changed = serialized !== loaded.serialized;
  const targetPlan = planConfigTarget(
    loaded.snapshot,
    changed ? serialized : loaded.raw,
    { backupExisting: changed && loaded.exists, mode: loaded.mode },
  );
  const plan = Object.freeze({
    provider: options.provider,
    operation: "install" as const,
    configPath: validated.configPath,
    changed: targetPlan.changed,
    action: !targetPlan.changed
      ? ("unchanged" as const)
      : loaded.exists
        ? ("update" as const)
        : ("create" as const),
    installedHooks: targetPlan.changed
      ? PROVIDER_EVENTS[options.provider].length
      : 0,
    targetPlan,
  });
  if (!validated.executableIdentity) {
    throw new Error("Side Glance executable validation was incomplete.");
  }
  executableIdentities.set(plan, validated.executableIdentity);
  return plan;
}

function managedHook(
  provider: InstallableProvider,
  eventName: string,
  command: string,
): HookCommand {
  const teardown = eventName === "SessionEnd";
  return {
    type: "command",
    command,
    // Claude and Codex express hook timeouts in seconds; Gemini uses milliseconds.
    timeout:
      provider === "gemini"
        ? teardown
          ? 3_000
          : 10_000
        : teardown
          ? 3
          : 10,
  };
}

export async function uninstallProviderHooks(
  options: InstallerOptions,
): Promise<InstallerResult> {
  return withConfigWriterLock(options.homeDirectory, () =>
    uninstallProviderHooksUnlocked(options),
  );
}

export async function uninstallProviderHooksUnlocked(
  options: InstallerOptions,
): Promise<InstallerResult> {
  const plan = await planProviderHookUninstall(options);
  const applied = await applyProviderHookPlan(plan);
  try {
    await verifyProviderHookApplication(applied);
    return applied.result;
  } catch (error) {
    await restoreProviderHookApplication(applied).catch((rollbackError: unknown) => {
      throw new AggregateError(
        [error, rollbackError],
        "Provider hook verification failed and rollback encountered a conflict.",
      );
    });
    throw error;
  }
}

export async function planProviderHookUninstall(
  options: InstallerOptions,
): Promise<ProviderHookMutationPlan> {
  const validated = await validateOptions(options, false);
  const loaded = await readConfiguration(
    path.resolve(options.homeDirectory),
    validated.configPath,
  );
  const configuration = loaded.value;
  const hooks = readHooks(configuration);

  for (const [eventName, groups] of Object.entries(hooks)) {
    const retained = removeManagedHandlers(groups, options.provider);
    if (retained.length > 0) hooks[eventName] = retained;
    else delete hooks[eventName];
  }
  configuration.hooks = hooks;

  const serialized = serializeConfiguration(configuration);
  const changed = loaded.exists && serialized !== loaded.serialized;
  const targetPlan = loaded.exists
    ? planConfigTarget(loaded.snapshot, changed ? serialized : loaded.raw, {
        backupExisting: changed,
        mode: loaded.mode,
      })
    : planConfigTargetRemoval(loaded.snapshot);
  return Object.freeze({
    provider: options.provider,
    operation: "uninstall" as const,
    configPath: validated.configPath,
    changed: targetPlan.changed,
    action: targetPlan.changed ? ("update" as const) : ("unchanged" as const),
    installedHooks: 0,
    targetPlan,
  });
}

export async function applyProviderHookPlan(
  plan: ProviderHookMutationPlan,
): Promise<ProviderHookMutationApplication> {
  await revalidateProviderExecutable(plan);
  const targetApplication = await applyConfigTargetPlan(plan.targetPlan);
  const resultValue: InstallerResult = {
    provider: plan.provider,
    configPath: plan.configPath,
    changed: targetApplication.changed,
    installedHooks: plan.installedHooks,
    ...(targetApplication.backupPath
      ? { backupPath: targetApplication.backupPath }
      : {}),
  };
  return Object.freeze({ result: resultValue, targetApplication });
}

export async function backupProviderHookPlan(
  plan: ProviderHookMutationPlan,
): Promise<string | undefined> {
  return backupConfigTargetPlan(plan.targetPlan);
}

export async function revalidateProviderHookPlan(
  plan: ProviderHookMutationPlan,
): Promise<void> {
  await revalidateConfigTargetPlan(plan.targetPlan);
  await revalidateProviderExecutable(plan);
}

export async function verifyProviderHookPlan(
  plan: ProviderHookMutationPlan,
): Promise<void> {
  await verifyConfigTargetPlan(plan.targetPlan);
}

export async function verifyProviderHookApplication(
  application: ProviderHookMutationApplication,
): Promise<void> {
  await verifyConfigTargetApplication(application.targetApplication);
}

export async function restoreProviderHookApplication(
  application: ProviderHookMutationApplication,
): Promise<void> {
  await restoreConfigTargetApplication(application.targetApplication);
}

function configPathFor(homeDirectory: string, provider: InstallableProvider): string {
  switch (provider) {
    case "claude":
      return path.join(homeDirectory, ".claude", "settings.json");
    case "codex":
      return path.join(homeDirectory, ".codex", "hooks.json");
    case "gemini":
      return path.join(homeDirectory, ".gemini", "settings.json");
  }
}

async function inspectCodexNotify(homeDirectory: string): Promise<boolean> {
  const configPath = path.join(homeDirectory, ".codex", "config.toml");
  const snapshot = await captureConfigTarget({
    rootDirectory: homeDirectory,
    targetPath: configPath,
    label: "Codex config.toml",
    maxBytes: MAX_CONFIG_BYTES,
  });
  const raw = sensitiveConfigTargetSnapshotBytes(snapshot)?.toString("utf8");
  if (raw === undefined) return false;
  return /^\s*notify\s*=/mu.test(raw);
}

async function validateOptions(
  options: InstallerOptions,
  requireExecutable: boolean,
): Promise<{
  configPath: string;
  executablePath: string;
  executableIdentity?: ExecutableIdentityToken;
}> {
  if (!path.isAbsolute(options.homeDirectory)) {
    throw new Error("Installer home directory must be absolute.");
  }
  if (!path.isAbsolute(options.executablePath)) {
    throw new Error("Side Glance executable path must be absolute.");
  }
  const executablePath = path.resolve(options.executablePath);
  let executableIdentity: ExecutableIdentityToken | undefined;
  if (requireExecutable) {
    executableIdentity = await captureRetainableExecutable(executablePath);
  }

  return {
    configPath: configPathFor(path.resolve(options.homeDirectory), options.provider),
    executablePath,
    ...(executableIdentity ? { executableIdentity } : {}),
  };
}

async function readConfiguration(homeDirectory: string, configPath: string): Promise<{
  exists: boolean;
  value: Record<string, unknown>;
  serialized: string;
  mode: number;
  raw: Buffer;
  snapshot: ConfigTargetSnapshot;
}> {
  const snapshot = await captureConfigTarget({
    rootDirectory: homeDirectory,
    targetPath: configPath,
    label: "Provider configuration",
    maxBytes: MAX_CONFIG_BYTES,
    defaultMode: 0o600,
  });
  const raw = sensitiveConfigTargetSnapshotBytes(snapshot) ?? Buffer.alloc(0);
  if (!snapshot.exists) {
    const value = {};
    return {
      exists: false,
      value,
      serialized: serializeConfiguration(value),
      mode: snapshot.mode,
      raw,
      snapshot,
    };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("Provider configuration contains malformed JSON; no changes made.");
  }
  if (!isRecord(value)) {
    throw new Error("Provider configuration JSON must contain an object.");
  }
  return {
    exists: true,
    value,
    serialized: serializeConfiguration(value),
    mode: snapshot.mode,
    raw,
    snapshot,
  };
}

function readHooks(configuration: Record<string, unknown>): HookConfiguration {
  if (configuration.hooks === undefined) return {};
  if (!isRecord(configuration.hooks)) {
    throw new Error("Provider hooks configuration must be an object.");
  }

  const parsed: HookConfiguration = {};
  for (const [eventName, value] of Object.entries(configuration.hooks)) {
    if (!Array.isArray(value)) {
      throw new Error("Provider hook event must contain an array.");
    }
    parsed[eventName] = value.map((group) => parseHookGroup(group));
  }
  return parsed;
}

function parseHookGroup(value: unknown): HookGroup {
  if (!isRecord(value) || !Array.isArray(value.hooks)) {
    throw new Error("Provider hook group must contain a hooks array.");
  }
  const hooks = value.hooks.map((hook) => {
    if (!isRecord(hook) || typeof hook.type !== "string") {
      throw new Error("Provider hook command has an invalid shape.");
    }
    if (hook.command !== undefined && typeof hook.command !== "string") {
      throw new Error("Provider hook command must be a string.");
    }
    return { ...hook } as HookCommand;
  });
  return { ...value, hooks } as HookGroup;
}

async function captureRetainableExecutable(
  executablePath: string,
): Promise<ExecutableIdentityToken> {
  const identity = await captureExecutableIdentity(executablePath);
  if (
    detectEphemeralNpmExecution({
      environment: process.env,
      invocationPath: identity.invocationPath,
      realPath: identity.realPath,
    })
  ) {
    throw new Error(
      "Permanent provider hooks require a durable Side Glance executable outside temporary npm execution and cache paths.",
    );
  }
  return identity;
}

async function revalidateProviderExecutable(
  plan: ProviderHookMutationPlan,
): Promise<void> {
  if (plan.operation !== "install") return;
  const identity = executableIdentities.get(plan);
  if (!identity) {
    throw new Error("The retained Side Glance executable identity is unavailable.");
  }
  await revalidateExecutableIdentity(identity, { environment: process.env });
}

function removeManagedHandlers(
  groups: readonly HookGroup[],
  provider: InstallableProvider,
): HookGroup[] {
  return groups.flatMap((group) => {
    const hooks = group.hooks.filter(
      (hook) => !isManagedCommand(hook.command, provider),
    );
    return hooks.length > 0 ? [{ ...group, hooks }] : [];
  });
}

function countLegacyStoplightHooks(
  groups: readonly HookGroup[],
  homeDirectory: string,
): number {
  return groups.reduce(
    (count, group) =>
      count +
      group.hooks.filter((hook) =>
        isLegacyStoplightCommand(hook.command, homeDirectory),
      ).length,
    0,
  );
}

function removeLegacyStoplightHandlers(
  groups: readonly HookGroup[],
  homeDirectory: string,
): HookGroup[] {
  return groups.flatMap((group) => {
    const hooks = group.hooks.filter(
      (hook) => !isLegacyStoplightCommand(hook.command, homeDirectory),
    );
    return hooks.length > 0 ? [{ ...group, hooks }] : [];
  });
}

function isLegacyStoplightCommand(
  command: string | undefined,
  homeDirectory: string,
): boolean {
  if (typeof command !== "string") return false;
  const script = path.join(homeDirectory, ".claude", "hooks", "stoplight.sh");
  const invocations = [
    "bash $HOME/.claude/hooks/stoplight.sh",
    'bash "$HOME/.claude/hooks/stoplight.sh"',
    `bash ${shellQuote(script)}`,
    `/bin/bash ${shellQuote(script)}`,
  ];
  const actions = ["session", "start", "wait", "done", "idle"];
  return invocations.some((invocation) =>
    actions.some((action) => command === `${invocation} ${action}`),
  );
}

function isManagedCommand(
  command: string | undefined,
  provider: InstallableProvider,
): boolean {
  return (
    typeof command === "string" &&
    [MANAGED_MARKER, LEGACY_MANAGED_MARKER].some((marker) =>
      command.startsWith(`${marker} `),
    ) &&
    command.includes(` hook --provider ${provider} --json`)
  );
}

function hasDirectSurfaceOption(
  command: string | undefined,
  provider: InstallableProvider,
): boolean {
  return (
    typeof command === "string" &&
    command.includes(
      ` hook --provider ${provider} --json --discover-terminal`,
    )
  );
}

function managedCommand(
  provider: InstallableProvider,
  executablePath: string,
  options: Pick<
    InstallerOptions,
    "directSurface" | "notifications" | "notificationSound"
  >,
): string {
  if (options.notificationSound !== undefined && !options.notifications) {
    throw new Error("--notification-sound requires --notifications.");
  }
  const notificationArguments = options.notifications
    ? ` --notifications${
        options.notificationSound === undefined
          ? ""
          : ` --notification-sound ${shellQuote(
              validateNotificationSound(options.notificationSound),
            )}`
      }`
    : "";
  const directSurfaceArgument = options.directSurface
    ? " --discover-terminal"
    : "";
  return `${MANAGED_MARKER} ${shellQuote(executablePath)} hook --provider ${provider} --json${directSurfaceArgument}${notificationArguments}`;
}

function validateNotificationSound(value: string): string {
  const normalized = value.normalize("NFC");
  if (
    normalized.trim() !== normalized ||
    normalized.length === 0 ||
    [...normalized].length > MAX_NOTIFICATION_SOUND_CODE_POINTS ||
    normalized.startsWith("--") ||
    normalized.includes("/") ||
    [...normalized].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    })
  ) {
    throw new Error(
      `notification sound must be a safe installed sound name of 1 to ${MAX_NOTIFICATION_SOUND_CODE_POINTS} characters.`,
    );
  }
  return normalized;
}

function shellQuote(value: string): string {
  if ([...value].some((character) => (character.codePointAt(0) ?? 0) <= 0x1f)) {
    throw new Error("Side Glance executable path may not contain control characters.");
  }
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function serializeConfiguration(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
