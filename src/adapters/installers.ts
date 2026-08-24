import { constants } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { MAX_NOTIFICATION_SOUND_CODE_POINTS } from "../notifications/policy.ts";

const MANAGED_MARKER = "SIDE_GLANCE_MANAGED_HOOK=1";
const LEGACY_MANAGED_MARKER = "SIGNAL_MANAGED_HOOK=1";
const MAX_CONFIG_BYTES = 2 * 1_048_576;

export type InstallableProvider = "claude" | "codex" | "gemini";

export interface InstallerOptions {
  provider: InstallableProvider;
  homeDirectory: string;
  executablePath: string;
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
  integrationStatus: "installed" | "partial" | "not-installed";
  managedHooks: Array<{
    event: string;
    notifications: boolean;
    soundConfigured: boolean;
    timeout: number | null;
    timeoutUnit: "seconds" | "milliseconds";
  }>;
  notifyConfigured?: boolean;
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
  const loaded = await readConfiguration(configPath);
  const hooks = readHooks(loaded.value);
  const groups = Object.values(hooks).flat();
  const managedHooks = Object.entries(hooks).flatMap(([event, eventGroups]) =>
    eventGroups.flatMap((group) =>
      group.hooks.flatMap((hook) => {
        if (!isManagedCommand(hook.command, options.provider)) return [];
        return [
          {
            event,
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
  const expectedEvents = PROVIDER_EVENTS[options.provider].length;
  const inspection: ProviderInspection = {
    provider: options.provider,
    configPath,
    exists: loaded.exists,
    valid: true,
    expectedEvents,
    existingHookGroups: groups.length,
    sideGlanceHooks: managedHooks.length,
    integrationStatus:
      managedHooks.length === expectedEvents
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
  const validated = await validateOptions(options, true);
  const loaded = await readConfiguration(validated.configPath);
  const configuration = loaded.value;
  const hooks = readHooks(configuration);
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
  if (serialized === loaded.serialized) {
    return result(options.provider, validated.configPath, false);
  }

  const backupPath = loaded.exists
    ? await backupConfiguration(validated.configPath)
    : undefined;
  await writeConfigurationAtomic(
    validated.configPath,
    serialized,
    loaded.mode,
  );
  return {
    ...result(options.provider, validated.configPath, true),
    ...(backupPath ? { backupPath } : {}),
    installedHooks: PROVIDER_EVENTS[options.provider].length,
  };
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
  const validated = await validateOptions(options, false);
  const loaded = await readConfiguration(validated.configPath);
  if (!loaded.exists) {
    return result(options.provider, validated.configPath, false);
  }
  const configuration = loaded.value;
  const hooks = readHooks(configuration);

  for (const [eventName, groups] of Object.entries(hooks)) {
    const retained = removeManagedHandlers(groups, options.provider);
    if (retained.length > 0) hooks[eventName] = retained;
    else delete hooks[eventName];
  }
  configuration.hooks = hooks;

  const serialized = serializeConfiguration(configuration);
  if (serialized === loaded.serialized) {
    return result(options.provider, validated.configPath, false);
  }

  const backupPath = await backupConfiguration(validated.configPath);
  await writeConfigurationAtomic(
    validated.configPath,
    serialized,
    loaded.mode,
  );
  return {
    ...result(options.provider, validated.configPath, true),
    backupPath,
  };
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
  let metadata;
  try {
    metadata = await lstat(configPath);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return false;
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error("Codex config.toml must be a regular file, not a link.");
  }
  if (metadata.size > MAX_CONFIG_BYTES) {
    throw new Error("Codex config.toml is too large to inspect safely.");
  }
  const raw = await readFile(configPath, "utf8");
  return /^\s*notify\s*=/mu.test(raw);
}

async function validateOptions(
  options: InstallerOptions,
  requireExecutable: boolean,
): Promise<{
  configPath: string;
  executablePath: string;
}> {
  if (!path.isAbsolute(options.homeDirectory)) {
    throw new Error("Installer home directory must be absolute.");
  }
  if (!path.isAbsolute(options.executablePath)) {
    throw new Error("Side Glance executable path must be absolute.");
  }
  const executablePath = path.resolve(options.executablePath);
  if (requireExecutable) {
    const executableMetadata = await stat(executablePath);
    if (!executableMetadata.isFile()) {
      throw new Error("Side Glance executable must resolve to a regular file.");
    }
    if ((executableMetadata.mode & 0o111) === 0) {
      throw new Error("Side Glance executable must have an executable permission bit.");
    }
  }

  return {
    configPath: configPathFor(path.resolve(options.homeDirectory), options.provider),
    executablePath,
  };
}

async function readConfiguration(configPath: string): Promise<{
  exists: boolean;
  value: Record<string, unknown>;
  serialized: string;
  mode: number;
}> {
  let metadata;
  try {
    metadata = await lstat(configPath);
  } catch (error) {
    if (hasCode(error, "ENOENT")) {
      const value = {};
      return {
        exists: false,
        value,
        serialized: serializeConfiguration(value),
        mode: 0o600,
      };
    }
    throw error;
  }

  if (metadata.isSymbolicLink()) {
    throw new Error("Provider configuration may not be a symbolic link.");
  }
  if (!metadata.isFile()) {
    throw new Error("Provider configuration must be a regular file.");
  }
  if (metadata.size > MAX_CONFIG_BYTES) {
    throw new Error("Provider configuration is too large to update safely.");
  }

  const raw = await readFile(configPath, "utf8");
  let value: unknown;
  try {
    value = JSON.parse(raw);
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
    mode: metadata.mode & 0o777,
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
      throw new Error(`Provider hook event ${eventName} must contain an array.`);
    }
    parsed[eventName] = value.map((group) => parseHookGroup(group, eventName));
  }
  return parsed;
}

function parseHookGroup(value: unknown, eventName: string): HookGroup {
  if (!isRecord(value) || !Array.isArray(value.hooks)) {
    throw new Error(`Provider hook group ${eventName} must contain a hooks array.`);
  }
  const hooks = value.hooks.map((hook) => {
    if (!isRecord(hook) || typeof hook.type !== "string") {
      throw new Error(`Provider hook command ${eventName} has an invalid shape.`);
    }
    if (hook.command !== undefined && typeof hook.command !== "string") {
      throw new Error(`Provider hook command ${eventName} must be a string.`);
    }
    return { ...hook } as HookCommand;
  });
  return { ...value, hooks } as HookGroup;
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

function managedCommand(
  provider: InstallableProvider,
  executablePath: string,
  options: Pick<InstallerOptions, "notifications" | "notificationSound">,
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
  return `${MANAGED_MARKER} ${shellQuote(executablePath)} hook --provider ${provider} --json${notificationArguments}`;
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

async function backupConfiguration(configPath: string): Promise<string> {
  const backupPath = `${configPath}.side-glance-backup-${Date.now()}-${randomUUID()}`;
  await copyFile(configPath, backupPath, constants.COPYFILE_EXCL);
  const metadata = await stat(configPath);
  await chmod(backupPath, metadata.mode & 0o777);
  return backupPath;
}

async function writeConfigurationAtomic(
  configPath: string,
  serialized: string,
  mode: number,
): Promise<void> {
  await mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
  const temporaryPath = path.join(
    path.dirname(configPath),
    `.${path.basename(configPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await open(
      temporaryPath,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      mode,
    );
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, configPath);
    await chmod(configPath, mode);
  } finally {
    if (handle) await handle.close();
    await unlink(temporaryPath).catch((error: unknown) => {
      if (!hasCode(error, "ENOENT")) throw error;
    });
  }
}

function serializeConfiguration(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function result(
  provider: InstallableProvider,
  configPath: string,
  changed: boolean,
): InstallerResult {
  return { provider, configPath, changed, installedHooks: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
