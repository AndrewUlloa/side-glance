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

const MANAGED_MARKER = "// SIDE_GLANCE_MANAGED_OPENCODE_PLUGIN=1";
const LEGACY_MANAGED_MARKER = "// SIGNAL_MANAGED_OPENCODE_PLUGIN=1";
const MANIFEST_PREFIX = "// SIDE_GLANCE_MANIFEST=";
const MANIFEST = { schema: 1, provider: "opencode" } as const;
const MAX_PLUGIN_BYTES = 1_048_576;
const executableIdentities = new WeakMap<
  OpenCodePluginMutationPlan,
  ExecutableIdentityToken
>();

export interface OpenCodePluginInstallerOptions {
  homeDirectory: string;
  executablePath: string;
  notifications?: boolean;
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

export interface OpenCodePluginMutationPlan {
  readonly provider: "opencode";
  readonly operation: "install" | "uninstall";
  readonly configPath: string;
  readonly changed: boolean;
  readonly action: "create" | "update" | "unchanged";
  readonly installedHooks: number;
  readonly targetPlan: ConfigTargetPlan;
}

export interface OpenCodePluginMutationApplication {
  readonly result: OpenCodePluginInstallerResult;
  readonly targetApplication: ConfigTargetApplication;
}

type TargetKind = "absent" | "current" | "legacy" | "unrelated";

interface LoadedTarget {
  kind: TargetKind;
  source?: string;
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
  return withConfigWriterLock(options.homeDirectory, () =>
    installOpenCodePluginUnlocked(options),
  );
}

export async function installOpenCodePluginUnlocked(
  options: OpenCodePluginInstallerOptions,
): Promise<OpenCodePluginInstallerResult> {
  const plan = await planOpenCodePluginInstall(options);
  const applied = await applyOpenCodePluginPlan(plan);
  try {
    await verifyOpenCodePluginApplication(applied);
    return applied.result;
  } catch (error) {
    await restoreOpenCodePluginApplication(applied).catch(
      (rollbackError: unknown) => {
        throw new AggregateError(
          [error, rollbackError],
          "OpenCode plugin verification failed and rollback encountered a conflict.",
        );
      },
    );
    throw error;
  }
}

export async function planOpenCodePluginInstall(
  options: OpenCodePluginInstallerOptions,
): Promise<OpenCodePluginMutationPlan> {
  const validated = await validateInstallOptions(options);
  const snapshot = await captureOpenCodeTarget(
    validated.homeDirectory,
    validated.configPath,
  );
  const loaded = loadTarget(snapshot);
  if (loaded.kind === "unrelated") {
    throw new Error(
      "OpenCode plugin target exists but is not owned by Side Glance; no changes made.",
    );
  }

  const source = pluginSource(
    validated.executablePath,
    options.notifications === true,
    validated.sound,
  );
  const targetPlan = planConfigTarget(
    snapshot,
    loaded.kind === "current" && loaded.source === source
      ? sensitiveConfigTargetSnapshotBytes(snapshot) ?? source
      : source,
    {
      backupExisting: snapshot.exists,
      mode: snapshot.mode,
    },
  );
  const plan = Object.freeze({
    provider: "opencode" as const,
    operation: "install" as const,
    configPath: validated.configPath,
    changed: targetPlan.changed,
    action: !targetPlan.changed
      ? ("unchanged" as const)
      : snapshot.exists
        ? ("update" as const)
        : ("create" as const),
    installedHooks: 1,
    targetPlan,
  });
  executableIdentities.set(plan, validated.executableIdentity);
  return plan;
}

export async function uninstallOpenCodePlugin(
  options: OpenCodePluginInstallerOptions,
): Promise<OpenCodePluginInstallerResult> {
  return withConfigWriterLock(options.homeDirectory, () =>
    uninstallOpenCodePluginUnlocked(options),
  );
}

export async function uninstallOpenCodePluginUnlocked(
  options: OpenCodePluginInstallerOptions,
): Promise<OpenCodePluginInstallerResult> {
  const plan = await planOpenCodePluginUninstall(options);
  const applied = await applyOpenCodePluginPlan(plan);
  try {
    await verifyOpenCodePluginApplication(applied);
    return applied.result;
  } catch (error) {
    await restoreOpenCodePluginApplication(applied).catch(
      (rollbackError: unknown) => {
        throw new AggregateError(
          [error, rollbackError],
          "OpenCode plugin verification failed and rollback encountered a conflict.",
        );
      },
    );
    throw error;
  }
}

export async function planOpenCodePluginUninstall(
  options: OpenCodePluginInstallerOptions,
): Promise<OpenCodePluginMutationPlan> {
  const configPath = openCodePluginPath(options.homeDirectory);
  validateAbsoluteExecutable(options.executablePath);
  const snapshot = await captureOpenCodeTarget(
    path.resolve(options.homeDirectory),
    configPath,
  );
  const loaded = loadTarget(snapshot);
  const targetPlan =
    loaded.kind === "current" || loaded.kind === "legacy"
      ? planConfigTargetRemoval(snapshot)
      : snapshot.exists
        ? planConfigTarget(
            snapshot,
            sensitiveConfigTargetSnapshotBytes(snapshot) ?? Buffer.alloc(0),
            { mode: snapshot.mode },
          )
        : planConfigTargetRemoval(snapshot);
  return Object.freeze({
    provider: "opencode" as const,
    operation: "uninstall" as const,
    configPath,
    changed: targetPlan.changed,
    action: targetPlan.changed ? ("update" as const) : ("unchanged" as const),
    installedHooks: 0,
    targetPlan,
  });
}

export async function applyOpenCodePluginPlan(
  plan: OpenCodePluginMutationPlan,
): Promise<OpenCodePluginMutationApplication> {
  await revalidateOpenCodeExecutable(plan);
  const targetApplication = await applyConfigTargetPlan(plan.targetPlan);
  const resultValue: OpenCodePluginInstallerResult = {
    provider: "opencode",
    configPath: plan.configPath,
    changed: targetApplication.changed,
    installedHooks: plan.installedHooks,
    ...(targetApplication.backupPath
      ? { backupPath: targetApplication.backupPath }
      : {}),
  };
  return Object.freeze({ result: resultValue, targetApplication });
}

export async function backupOpenCodePluginPlan(
  plan: OpenCodePluginMutationPlan,
): Promise<string | undefined> {
  return backupConfigTargetPlan(plan.targetPlan);
}

export async function revalidateOpenCodePluginPlan(
  plan: OpenCodePluginMutationPlan,
): Promise<void> {
  await revalidateConfigTargetPlan(plan.targetPlan);
  await revalidateOpenCodeExecutable(plan);
}

export async function verifyOpenCodePluginPlan(
  plan: OpenCodePluginMutationPlan,
): Promise<void> {
  await verifyConfigTargetPlan(plan.targetPlan);
}

export async function verifyOpenCodePluginApplication(
  application: OpenCodePluginMutationApplication,
): Promise<void> {
  await verifyConfigTargetApplication(application.targetApplication);
}

export async function restoreOpenCodePluginApplication(
  application: OpenCodePluginMutationApplication,
): Promise<void> {
  await restoreConfigTargetApplication(application.targetApplication);
}

export async function inspectOpenCodePlugin(
  homeDirectory: string,
): Promise<OpenCodePluginInspection> {
  const configPath = openCodePluginPath(homeDirectory);
  const snapshot = await captureOpenCodeTarget(
    path.resolve(homeDirectory),
    configPath,
  );
  const loaded = loadTarget(snapshot);
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
  executableIdentity: ExecutableIdentityToken;
}> {
  const configPath = openCodePluginPath(options.homeDirectory);
  const executablePath = validateAbsoluteExecutable(options.executablePath);
  const executableIdentity = await captureRetainableExecutable(executablePath);
  const sound =
    options.notificationSound === undefined
      ? undefined
      : validateNotificationSound(options.notificationSound);
  if (sound !== undefined && !options.notifications) {
    throw new Error("Notification sound requires notifications to be enabled.");
  }
  return {
    homeDirectory: path.resolve(options.homeDirectory),
    executablePath,
    configPath,
    executableIdentity,
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

async function revalidateOpenCodeExecutable(
  plan: OpenCodePluginMutationPlan,
): Promise<void> {
  if (plan.operation !== "install") return;
  const identity = executableIdentities.get(plan);
  if (!identity) {
    throw new Error("The retained Side Glance executable identity is unavailable.");
  }
  await revalidateExecutableIdentity(identity, { environment: process.env });
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

async function captureOpenCodeTarget(
  homeDirectory: string,
  configPath: string,
): Promise<ConfigTargetSnapshot> {
  return captureConfigTarget({
    rootDirectory: homeDirectory,
    targetPath: configPath,
    label: "OpenCode plugin target",
    maxBytes: MAX_PLUGIN_BYTES,
    defaultMode: 0o600,
  });
}

function loadTarget(snapshot: ConfigTargetSnapshot): LoadedTarget {
  const bytes = sensitiveConfigTargetSnapshotBytes(snapshot);
  if (!bytes) return { kind: "absent" };
  const source = bytes.toString("utf8");
  const firstLine = source.split(/\r?\n/u, 1)[0];
  if (firstLine === LEGACY_MANAGED_MARKER) {
    return { kind: "legacy", source };
  }
  if (firstLine !== MANAGED_MARKER) {
    return { kind: "unrelated", source };
  }
  assertCurrentManifest(source);
  return { kind: "current", source };
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

function pluginSource(
  executablePath: string,
  notifications: boolean,
  sound: string | undefined,
): string {
  const args = [
    "hook",
    "--provider",
    "opencode",
    ...(notifications ? ["--notifications"] : []),
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

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
}
