import { randomUUID } from "node:crypto";
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

import { MAX_NOTIFICATION_SOUND_CODE_POINTS } from "../notifications/policy.ts";

const MANAGED_MARKER = "// SIDE_GLANCE_MANAGED_OPENCODE_PLUGIN=1";
const LEGACY_MANAGED_MARKER = "// SIGNAL_MANAGED_OPENCODE_PLUGIN=1";
const MANIFEST_PREFIX = "// SIDE_GLANCE_MANIFEST=";
const MANIFEST = { schema: 1, provider: "opencode" } as const;
const MAX_PLUGIN_BYTES = 1_048_576;

export interface OpenCodePluginInstallerOptions {
  homeDirectory: string;
  executablePath: string;
  notificationSound?: string;
}

export interface OpenCodePluginInstallerResult {
  provider: "opencode";
  configPath: string;
  changed: boolean;
  backupPath?: string;
  installedHooks: number;
}

export interface OpenCodePluginInspection {
  provider: "opencode";
  configPath: string;
  status: "installed" | "legacy" | "not-installed" | "unrelated";
  installed: boolean;
  api: "v1-stable";
}

type TargetKind = "absent" | "current" | "legacy" | "unrelated";

interface LoadedTarget {
  kind: TargetKind;
  source?: string;
  device?: bigint;
  inode?: bigint;
}

export function openCodePluginPath(homeDirectory: string): string {
  if (!path.isAbsolute(homeDirectory)) {
    throw new Error("OpenCode installer home directory must be absolute.");
  }
  return path.join(
    path.resolve(homeDirectory),
    ".config",
    "opencode",
    "plugins",
    "side-glance.js",
  );
}

export async function installOpenCodePlugin(
  options: OpenCodePluginInstallerOptions,
): Promise<OpenCodePluginInstallerResult> {
  const validated = await validateInstallOptions(options);
  await ensurePrivatePluginDirectory(validated.homeDirectory);
  const loaded = await loadTarget(validated.configPath);
  if (loaded.kind === "unrelated") {
    throw new Error(
      "OpenCode plugin target exists but is not owned by Side Glance; no changes made.",
    );
  }

  const source = pluginSource(validated.executablePath, validated.sound);
  if (loaded.kind === "current" && loaded.source === source) {
    return result(validated.configPath, false, 1);
  }

  const backupPath =
    loaded.kind === "legacy"
      ? await backupOwnedTarget(validated.configPath)
      : undefined;
  await writePluginAtomic(validated.configPath, source, loaded);
  return {
    ...result(validated.configPath, true, 1),
    ...(backupPath ? { backupPath } : {}),
  };
}

export async function uninstallOpenCodePlugin(
  options: OpenCodePluginInstallerOptions,
): Promise<OpenCodePluginInstallerResult> {
  const configPath = openCodePluginPath(options.homeDirectory);
  validateAbsoluteExecutable(options.executablePath);
  const directoryStatus = await inspectPluginDirectory(options.homeDirectory);
  if (directoryStatus === "absent") return result(configPath, false, 0);

  const loaded = await loadTarget(configPath);
  if (loaded.kind === "absent" || loaded.kind === "unrelated") {
    return result(configPath, false, 0);
  }
  await verifyTargetUnchanged(configPath, loaded);
  await unlink(configPath);
  return result(configPath, true, 0);
}

export async function inspectOpenCodePlugin(
  homeDirectory: string,
): Promise<OpenCodePluginInspection> {
  const configPath = openCodePluginPath(homeDirectory);
  const directoryStatus = await inspectPluginDirectory(homeDirectory);
  if (directoryStatus === "absent") {
    return {
      provider: "opencode",
      configPath,
      status: "not-installed",
      installed: false,
      api: "v1-stable",
    };
  }
  const loaded = await loadTarget(configPath);
  const status =
    loaded.kind === "current"
      ? "installed"
      : loaded.kind === "legacy"
        ? "legacy"
        : loaded.kind === "unrelated"
          ? "unrelated"
          : "not-installed";
  return {
    provider: "opencode",
    configPath,
    status,
    installed: loaded.kind === "current",
    api: "v1-stable",
  };
}

async function validateInstallOptions(
  options: OpenCodePluginInstallerOptions,
): Promise<{
  homeDirectory: string;
  executablePath: string;
  configPath: string;
  sound?: string;
}> {
  const configPath = openCodePluginPath(options.homeDirectory);
  const executablePath = validateAbsoluteExecutable(options.executablePath);
  const executableMetadata = await stat(executablePath);
  if (!executableMetadata.isFile()) {
    throw new Error("Side Glance executable must resolve to a regular file.");
  }
  if ((executableMetadata.mode & 0o111) === 0) {
    throw new Error("Side Glance executable must have an executable permission bit.");
  }
  const sound =
    options.notificationSound === undefined
      ? undefined
      : validateNotificationSound(options.notificationSound);
  return {
    homeDirectory: path.resolve(options.homeDirectory),
    executablePath,
    configPath,
    ...(sound ? { sound } : {}),
  };
}

function validateAbsoluteExecutable(executablePath: string): string {
  if (!path.isAbsolute(executablePath)) {
    throw new Error("Side Glance executable path must be absolute.");
  }
  if ([...executablePath].some(isControlCharacter)) {
    throw new Error("Side Glance executable path may not contain control characters.");
  }
  return path.resolve(executablePath);
}

function validateNotificationSound(sound: string): string {
  const normalized = sound.normalize("NFC").trim();
  if (normalized.length === 0) {
    throw new Error("Notification sound must not be empty.");
  }
  if ([...normalized].length > MAX_NOTIFICATION_SOUND_CODE_POINTS) {
    throw new Error(
      `Notification sound may not exceed ${MAX_NOTIFICATION_SOUND_CODE_POINTS} characters.`,
    );
  }
  if (
    normalized.startsWith("--") ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    [...normalized].some(isControlCharacter)
  ) {
    throw new Error("Notification sound contains unsupported characters.");
  }
  return normalized;
}

async function ensurePrivatePluginDirectory(homeDirectory: string): Promise<void> {
  const directories = [
    path.resolve(homeDirectory),
    path.join(homeDirectory, ".config"),
    path.join(homeDirectory, ".config", "opencode"),
    path.join(homeDirectory, ".config", "opencode", "plugins"),
  ];
  await requireDirectory(directories[0], "Installer home directory");
  for (const directory of directories.slice(1)) {
    await mkdir(directory, { mode: 0o700 }).catch((error: unknown) => {
      if (!hasCode(error, "EEXIST")) throw error;
    });
    await requireDirectory(directory, "OpenCode plugin directory");
  }
}

async function inspectPluginDirectory(
  homeDirectory: string,
): Promise<"present" | "absent"> {
  const directories = [
    path.resolve(homeDirectory),
    path.join(homeDirectory, ".config"),
    path.join(homeDirectory, ".config", "opencode"),
    path.join(homeDirectory, ".config", "opencode", "plugins"),
  ];
  for (const directory of directories) {
    try {
      await requireDirectory(directory, "OpenCode plugin directory");
    } catch (error) {
      if (hasCode(error, "ENOENT")) return "absent";
      throw error;
    }
  }
  return "present";
}

async function requireDirectory(directory: string, label: string): Promise<void> {
  const metadata = await lstat(directory, { bigint: true });
  if (metadata.isSymbolicLink()) {
    throw new Error(`${label} may not be a symbolic link.`);
  }
  if (!metadata.isDirectory()) {
    throw new Error(`${label} must be a directory.`);
  }
}

async function loadTarget(configPath: string): Promise<LoadedTarget> {
  let metadata;
  try {
    metadata = await lstat(configPath, { bigint: true });
  } catch (error) {
    if (hasCode(error, "ENOENT")) return { kind: "absent" };
    throw error;
  }
  if (metadata.isSymbolicLink()) {
    throw new Error("OpenCode plugin target may not be a symbolic link.");
  }
  if (!metadata.isFile()) {
    throw new Error("OpenCode plugin target must be a regular file.");
  }
  if (metadata.size > BigInt(MAX_PLUGIN_BYTES)) {
    throw new Error("OpenCode plugin target is too large to update safely.");
  }

  const source = await readFile(configPath, "utf8");
  const firstLine = source.split(/\r?\n/u, 1)[0];
  if (firstLine === LEGACY_MANAGED_MARKER) {
    return {
      kind: "legacy",
      source,
      device: metadata.dev,
      inode: metadata.ino,
    };
  }
  if (firstLine !== MANAGED_MARKER) {
    return {
      kind: "unrelated",
      source,
      device: metadata.dev,
      inode: metadata.ino,
    };
  }
  assertCurrentManifest(source);
  return {
    kind: "current",
    source,
    device: metadata.dev,
    inode: metadata.ino,
  };
}

function assertCurrentManifest(source: string): void {
  const manifestLine = source.split(/\r?\n/u)[1];
  if (!manifestLine?.startsWith(MANIFEST_PREFIX)) {
    throw new Error("Side Glance-owned OpenCode plugin has a malformed manifest.");
  }
  try {
    const value: unknown = JSON.parse(manifestLine.slice(MANIFEST_PREFIX.length));
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      Object.keys(value).length !== 2 ||
      !("schema" in value) ||
      value.schema !== MANIFEST.schema ||
      !("provider" in value) ||
      value.provider !== MANIFEST.provider
    ) {
      throw new Error("invalid manifest");
    }
  } catch {
    throw new Error("Side Glance-owned OpenCode plugin has a malformed manifest.");
  }
}

function pluginSource(executablePath: string, sound: string | undefined): string {
  const args = [
    "hook",
    "--provider",
    "opencode",
    "--notifications",
    ...(sound ? ["--notification-sound", sound] : []),
    "--json",
  ];
  return `${MANAGED_MARKER}
${MANIFEST_PREFIX}${JSON.stringify(MANIFEST)}
import { spawn } from "node:child_process";

const executable = ${JSON.stringify(executablePath)};
const args = ${JSON.stringify(args)};
const HOOK_TIMEOUT_MS = 2_000;
const TERMINATION_GRACE_MS = 250;
const MAX_SESSION_CACHE_ENTRIES = 1_024;
const sessionKinds = new Map();

function recordSessionKind(sessionID, kind) {
  sessionKinds.delete(sessionID);
  sessionKinds.set(sessionID, kind);
  if (sessionKinds.size <= MAX_SESSION_CACHE_ENTRIES) return;
  const oldest = sessionKinds.keys().next().value;
  if (oldest !== undefined) sessionKinds.delete(oldest);
}

function sessionKindFromInfo(info, expectedSessionID) {
  if (typeof info !== "object" || info === null || Array.isArray(info)) {
    return undefined;
  }
  if (info.id !== expectedSessionID) return undefined;
  if (!Object.prototype.hasOwnProperty.call(info, "parentID")) return "top";
  return typeof info.parentID === "string" && info.parentID.length > 0
    ? "child"
    : undefined;
}

function eventProperties(event) {
  return typeof event?.properties === "object" &&
    event.properties !== null &&
    !Array.isArray(event.properties)
    ? event.properties
    : undefined;
}

function eventSessionID(event) {
  const properties = eventProperties(event);
  if (!properties) return undefined;
  if (typeof properties.sessionID === "string" && properties.sessionID.length > 0) {
    return properties.sessionID;
  }
  return typeof properties.info?.id === "string" && properties.info.id.length > 0
    ? properties.info.id
    : undefined;
}

function updateSessionCache(event) {
  const properties = eventProperties(event);
  const sessionID = eventSessionID(event);
  if (!properties || !sessionID) return;
  if (event.type !== "session.created" && event.type !== "session.updated") {
    return;
  }
  const kind = sessionKindFromInfo(properties.info, sessionID);
  if (kind) recordSessionKind(sessionID, kind);
}

function isSupportedEvent(event) {
  if (
    event?.type === "session.created" ||
    event?.type === "session.idle" ||
    event?.type === "session.error" ||
    event?.type === "session.deleted" ||
    event?.type === "permission.asked" ||
    event?.type === "permission.replied"
  ) {
    return true;
  }
  return (
    event?.type === "session.status" &&
    eventProperties(event)?.status?.type === "busy"
  );
}

async function lookupSessionKind(client, sessionID) {
  if (typeof client?.session?.get !== "function") return undefined;
  try {
    const response = await client.session.get({ path: { id: sessionID } });
    const info = response?.data ?? response;
    const kind = sessionKindFromInfo(info, sessionID);
    if (kind) recordSessionKind(sessionID, kind);
    return kind;
  } catch {
    return undefined;
  }
}

async function shouldSuppressSessionEvent(event, client) {
  const sessionID = eventSessionID(event);
  if (!sessionID) return true;
  const eventKind = sessionKindFromInfo(
    eventProperties(event)?.info,
    sessionID,
  );
  if (eventKind) recordSessionKind(sessionID, eventKind);
  const kind = eventKind ?? sessionKinds.get(sessionID) ??
    (await lookupSessionKind(client, sessionID));
  return kind !== "top";
}

async function forward(event) {
  let payload;
  try {
    payload = JSON.stringify(event);
  } catch {
    return;
  }
  await new Promise((resolve) => {
    let child;
    try {
      child = spawn(executable, args, {
        shell: false,
        stdio: ["pipe", "ignore", "ignore"],
        windowsHide: true,
      });
    } catch {
      resolve();
      return;
    }
    let settled = false;
    let timeout;
    let forceKillTimeout;
    let finishTimeout;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (forceKillTimeout) clearTimeout(forceKillTimeout);
      if (finishTimeout) clearTimeout(finishTimeout);
      resolve();
    };
    const terminate = () => {
      if (settled) return;
      child.stdin?.destroy();
      if (child.exitCode !== null || child.signalCode !== null) {
        finish();
        return;
      }
      child.kill("SIGTERM");
      if (forceKillTimeout) return;
      forceKillTimeout = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
        finishTimeout = setTimeout(() => {
          child.unref();
          finish();
        }, TERMINATION_GRACE_MS);
        finishTimeout.unref?.();
      }, TERMINATION_GRACE_MS);
      forceKillTimeout.unref?.();
    };
    child.once("error", finish);
    child.once("close", finish);
    if (!child.stdin) {
      terminate();
      return;
    }
    child.stdin.once("error", terminate);
    timeout = setTimeout(terminate, HOOK_TIMEOUT_MS);
    timeout.unref?.();
    try {
      child.stdin.end(payload);
    } catch {
      terminate();
    }
  });
}

export const SideGlancePlugin = async (context = {}) => ({
  event: async ({ event }) => {
    try {
      updateSessionCache(event);
      if (!isSupportedEvent(event)) return;
      const sessionID = eventSessionID(event);
      const shouldSuppress = await shouldSuppressSessionEvent(
        event,
        context.client,
      );
      if (event?.type === "session.deleted" && sessionID) {
        sessionKinds.delete(sessionID);
      }
      if (shouldSuppress) return;
    } catch {
      return;
    }
    await forward(event);
  },
});
`;
}

async function backupOwnedTarget(configPath: string): Promise<string> {
  const backupPath = `${configPath}.side-glance-backup-${Date.now()}-${randomUUID()}`;
  await copyFile(configPath, backupPath, constants.COPYFILE_EXCL);
  await chmod(backupPath, 0o600);
  return backupPath;
}

async function writePluginAtomic(
  configPath: string,
  source: string,
  previous: LoadedTarget,
): Promise<void> {
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
      0o600,
    );
    await handle.writeFile(source, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await verifyTargetUnchanged(configPath, previous);
    await rename(temporaryPath, configPath);
    await chmod(configPath, 0o600);
  } finally {
    if (handle) await handle.close();
    await unlink(temporaryPath).catch((error: unknown) => {
      if (!hasCode(error, "ENOENT")) throw error;
    });
  }
}

async function verifyTargetUnchanged(
  configPath: string,
  previous: LoadedTarget,
): Promise<void> {
  let metadata;
  try {
    metadata = await lstat(configPath, { bigint: true });
  } catch (error) {
    if (hasCode(error, "ENOENT") && previous.kind === "absent") return;
    throw new Error("OpenCode plugin target changed during update; no changes made.");
  }
  if (
    previous.kind === "absent" ||
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.dev !== previous.device ||
    metadata.ino !== previous.inode
  ) {
    throw new Error("OpenCode plugin target changed during update; no changes made.");
  }
}

function result(
  configPath: string,
  changed: boolean,
  installedHooks: number,
): OpenCodePluginInstallerResult {
  return { provider: "opencode", configPath, changed, installedHooks };
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
