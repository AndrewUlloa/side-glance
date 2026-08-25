import { lstat } from "node:fs/promises";
import path from "node:path";

import {
  captureConfigTarget,
  sensitiveConfigTargetSnapshotBytes,
} from "../adapters/config-target.ts";

const MAX_CONFIG_BYTES = 1_048_576;
const MAX_SETTING_LENGTH = 128;
const MAX_NOTIFICATION_EVENTS = 32;

export type NotificationReadinessStatus =
  | "ready"
  | "disabled"
  | "not-configured"
  | "unavailable"
  | "unknown";

export type NotificationConfigFileStatus =
  | "absent"
  | "regular"
  | "symlink"
  | "not-file"
  | "oversized"
  | "malformed"
  | "unreadable";

export type NotificationPathProbe = (
  candidate: string,
) => boolean | Promise<boolean>;

export interface NotificationBackendHints {
  desktopSession?: boolean;
  osascript?: string;
  notifySend?: string;
  terminalNotifier?: string;
  aider?: string;
}

export interface NotificationInspectionOptions {
  homeDirectory: string;
  platform: NodeJS.Platform;
  pathProbe: NotificationPathProbe;
  backendHints?: NotificationBackendHints;
}

export interface SideGlanceBackendInspection {
  platform: NodeJS.Platform;
  status: "available" | "unavailable" | "unsupported";
  backend: "osascript" | "notify-send" | null;
}

interface ConfiguredProviderInspection {
  configPath: string;
  exists: boolean | null;
  fileStatus: NotificationConfigFileStatus;
  status: NotificationReadinessStatus;
}

export interface CodexNotificationInspection
  extends ConfiguredProviderInspection {
  provider: "codex";
  notifications?: boolean | string[];
  method?: string;
  condition?: string;
  effectiveDefault?: boolean;
  topLevelNotify: boolean | null;
}

export interface GeminiNotificationInspection
  extends ConfiguredProviderInspection {
  provider: "gemini";
  scope: "user";
  higherPrecedenceOverridesPossible: true;
  enabled?: boolean;
  method?: string;
}

export interface OpenCodeNotificationInspection
  extends ConfiguredProviderInspection {
  provider: "opencode";
  enabled?: boolean;
  notifications?: boolean;
  sound?: boolean;
  volume?: number;
}

export interface AiderNotificationInspection {
  provider: "aider";
  status: "ready" | "unavailable";
  binaryAvailable: boolean;
  backend: "terminal-notifier" | "osascript" | "notify-send" | null;
}

export interface NotificationReadinessInspection {
  sideGlance: SideGlanceBackendInspection;
  providers: {
    codex: CodexNotificationInspection;
    gemini: GeminiNotificationInspection;
    opencode: OpenCodeNotificationInspection;
    aider: AiderNotificationInspection;
  };
}

interface LoadedConfig {
  status: Exclude<NotificationConfigFileStatus, "malformed">;
  raw?: string;
}

export async function inspectNotificationReadiness(
  options: NotificationInspectionOptions,
): Promise<NotificationReadinessInspection> {
  if (!path.isAbsolute(options.homeDirectory)) {
    throw new Error("Notification inspection home directory must be absolute.");
  }
  const homeDirectory = path.resolve(options.homeDirectory);
  const hints = options.backendHints ?? {};
  const osascript = hints.osascript ?? "/usr/bin/osascript";
  const notifySend = hints.notifySend ?? "notify-send";
  const terminalNotifier = hints.terminalNotifier ?? "terminal-notifier";
  const aider = hints.aider ?? "aider";
  const hasDesktop = hints.desktopSession !== false;

  const osascriptAvailable =
    options.platform === "darwin" &&
    hasDesktop &&
    (await safeProbe(options.pathProbe, osascript));
  const notifySendAvailable =
    options.platform === "linux" &&
    hasDesktop &&
    (await safeProbe(options.pathProbe, notifySend));

  const sideGlance = inspectSideGlanceBackend(
    options.platform,
    osascriptAvailable,
    notifySendAvailable,
  );
  const aiderAvailable = await safeProbe(options.pathProbe, aider);
  let aiderBackend: AiderNotificationInspection["backend"] = null;
  if (aiderAvailable && hasDesktop) {
    if (options.platform === "darwin") {
      aiderBackend = (await safeProbe(options.pathProbe, terminalNotifier))
        ? "terminal-notifier"
        : osascriptAvailable
          ? "osascript"
          : null;
    } else if (options.platform === "linux" && notifySendAvailable) {
      aiderBackend = "notify-send";
    }
  }

  const [codex, gemini, opencode] = await Promise.all([
    inspectCodex(homeDirectory),
    inspectGemini(homeDirectory),
    inspectOpenCode(homeDirectory),
  ]);
  return {
    sideGlance,
    providers: {
      codex,
      gemini,
      opencode,
      aider: {
        provider: "aider",
        status: aiderAvailable && aiderBackend ? "ready" : "unavailable",
        binaryAvailable: aiderAvailable,
        backend: aiderBackend,
      },
    },
  };
}

function inspectSideGlanceBackend(
  platform: NodeJS.Platform,
  osascriptAvailable: boolean,
  notifySendAvailable: boolean,
): SideGlanceBackendInspection {
  if (platform === "darwin") {
    return {
      platform,
      status: osascriptAvailable ? "available" : "unavailable",
      backend: osascriptAvailable ? "osascript" : null,
    };
  }
  if (platform === "linux") {
    return {
      platform,
      status: notifySendAvailable ? "available" : "unavailable",
      backend: notifySendAvailable ? "notify-send" : null,
    };
  }
  return { platform, status: "unsupported", backend: null };
}

async function inspectCodex(
  homeDirectory: string,
): Promise<CodexNotificationInspection> {
  const configPath = path.join(homeDirectory, ".codex", "config.toml");
  const loaded = await readBoundedRegularFile(homeDirectory, configPath);
  if (loaded.status !== "regular" || loaded.raw === undefined) {
    if (loaded.status === "absent") {
      return {
        provider: "codex",
        configPath,
        exists: false,
        fileStatus: "absent",
        status: "ready",
        condition: "unfocused",
        effectiveDefault: true,
        topLevelNotify: false,
      };
    }
    return {
      provider: "codex",
      configPath,
      exists: existenceFor(loaded.status),
      fileStatus: loaded.status,
      status: statusForUnreadConfig(loaded.status),
      topLevelNotify: null,
    };
  }

  const parsed = parseCodexNotificationSettings(loaded.raw);
  return {
    provider: "codex",
    configPath,
    exists: true,
    fileStatus: parsed.malformed ? "malformed" : "regular",
    status: parsed.status,
    ...(parsed.notifications === undefined
      ? {}
      : { notifications: parsed.notifications }),
    ...(parsed.method === undefined ? {} : { method: parsed.method }),
    ...(parsed.condition === undefined ? {} : { condition: parsed.condition }),
    ...(parsed.effectiveDefault ? { effectiveDefault: true } : {}),
    topLevelNotify: parsed.topLevelNotify,
  };
}

async function inspectGemini(
  homeDirectory: string,
): Promise<GeminiNotificationInspection> {
  const scope = {
    scope: "user",
    higherPrecedenceOverridesPossible: true,
  } as const;
  const configPath = path.join(homeDirectory, ".gemini", "settings.json");
  const loaded = await readBoundedRegularFile(homeDirectory, configPath);
  if (loaded.status !== "regular" || loaded.raw === undefined) {
    return {
      provider: "gemini",
      configPath,
      exists: existenceFor(loaded.status),
      fileStatus: loaded.status,
      status: statusForUnreadConfig(loaded.status),
      ...scope,
    };
  }
  const parsed = parseJsonObject(loaded.raw);
  if (!parsed) {
    return {
      provider: "gemini",
      configPath,
      exists: true,
      fileStatus: "malformed",
      status: "unknown",
      ...scope,
    };
  }
  const general = recordValue(parsed.general);
  if (!general) {
    return {
      provider: "gemini",
      configPath,
      exists: true,
      fileStatus: "regular",
      status: "not-configured",
      ...scope,
    };
  }
  const enabled = booleanValue(general.enableNotifications);
  const method = boundedString(general.notificationMethod);
  const hasInvalidRelevantValue =
    ("enableNotifications" in general && enabled === undefined) ||
    ("notificationMethod" in general && method === undefined);
  return {
    provider: "gemini",
    configPath,
    exists: true,
    fileStatus: "regular",
    status: hasInvalidRelevantValue
      ? "unknown"
      : enabled === true
        ? "ready"
        : enabled === false
          ? "disabled"
          : "not-configured",
    ...scope,
    ...(enabled === undefined ? {} : { enabled }),
    ...(method === undefined ? {} : { method }),
  };
}

async function inspectOpenCode(
  homeDirectory: string,
): Promise<OpenCodeNotificationInspection> {
  const configPath = path.join(
    homeDirectory,
    ".config",
    "opencode",
    "tui.json",
  );
  const loaded = await readBoundedRegularFile(homeDirectory, configPath);
  if (loaded.status !== "regular" || loaded.raw === undefined) {
    return {
      provider: "opencode",
      configPath,
      exists: existenceFor(loaded.status),
      fileStatus: loaded.status,
      status: statusForUnreadConfig(loaded.status),
    };
  }
  const parsed = parseJsonObject(loaded.raw);
  if (!parsed) {
    return {
      provider: "opencode",
      configPath,
      exists: true,
      fileStatus: "malformed",
      status: "unknown",
    };
  }
  const attention = recordValue(parsed.attention);
  if (!attention) {
    return {
      provider: "opencode",
      configPath,
      exists: true,
      fileStatus: "regular",
      status: "not-configured",
    };
  }

  const enabled = booleanValue(attention.enabled);
  const notifications = booleanValue(attention.notifications);
  const sound = booleanValue(attention.sound);
  const volume = volumeValue(attention.volume);
  const hasInvalidRelevantValue =
    ("enabled" in attention && enabled === undefined) ||
    ("notifications" in attention && notifications === undefined) ||
    ("sound" in attention && sound === undefined) ||
    ("volume" in attention && volume === undefined);
  return {
    provider: "opencode",
    configPath,
    exists: true,
    fileStatus: "regular",
    status: hasInvalidRelevantValue
      ? "unknown"
      : enabled === true
        ? notifications === false && sound === false
          ? "disabled"
          : "ready"
        : enabled === false
          ? "disabled"
          : "not-configured",
    ...(enabled === undefined ? {} : { enabled }),
    ...(notifications === undefined ? {} : { notifications }),
    ...(sound === undefined ? {} : { sound }),
    ...(volume === undefined ? {} : { volume }),
  };
}

async function readBoundedRegularFile(
  homeDirectory: string,
  configPath: string,
): Promise<LoadedConfig> {
  let initialStatus: LoadedConfig["status"] | undefined;
  try {
    const metadata = await lstat(configPath);
    if (metadata.isSymbolicLink()) initialStatus = "symlink";
    else if (!metadata.isFile()) initialStatus = "not-file";
    else if (metadata.size > MAX_CONFIG_BYTES) initialStatus = "oversized";
  } catch (error) {
    if (!hasCode(error, "ENOENT")) return { status: "unreadable" };
  }
  if (initialStatus) return { status: initialStatus };

  try {
    const snapshot = await captureConfigTarget({
      rootDirectory: homeDirectory,
      targetPath: configPath,
      label: "Notification configuration",
      maxBytes: MAX_CONFIG_BYTES,
    });
    const bytes = sensitiveConfigTargetSnapshotBytes(snapshot);
    return bytes
      ? { status: "regular", raw: bytes.toString("utf8") }
      : { status: "absent" };
  } catch {
    return { status: "unreadable" };
  }
}

function parseCodexNotificationSettings(raw: string): {
  status: NotificationReadinessStatus;
  malformed: boolean;
  notifications?: boolean | string[];
  method?: string;
  condition?: string;
  effectiveDefault: boolean;
  topLevelNotify: boolean;
} {
  let section = "";
  let topLevelNotify = false;
  let notifications: boolean | string[] | undefined;
  let method: string | undefined;
  let condition: string | undefined;
  let relevantInvalid = false;

  const sourceLines = raw.split(/\r?\n/u);
  for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex += 1) {
    const sourceLine = sourceLines[lineIndex];
    const line = stripTomlComment(sourceLine).trim();
    if (!line) continue;
    const table = /^\[([^\]]+)\]$/u.exec(line);
    if (table) {
      section = table[1].trim();
      continue;
    }
    const assignment = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/u.exec(line);
    if (!assignment) continue;
    const [, key, rawValue] = assignment;
    if (section === "" && key === "notify") {
      topLevelNotify = true;
      continue;
    }
    if (section !== "tui") continue;
    if (key === "notifications") {
      const collected = collectTomlArray(
        sourceLines,
        lineIndex,
        rawValue.trim(),
      );
      lineIndex = collected.lastLineIndex;
      const parsed = parseTomlBooleanOrStringArray(collected.value);
      if (parsed === undefined) relevantInvalid = true;
      else notifications = parsed;
    } else if (key === "notification_method") {
      const parsed = parseTomlString(rawValue.trim());
      if (parsed === undefined) relevantInvalid = true;
      else method = parsed;
    } else if (key === "notification_condition") {
      const parsed = parseTomlString(rawValue.trim());
      if (parsed === undefined) relevantInvalid = true;
      else condition = parsed;
    }
  }

  const enabled =
    notifications === true ||
    (Array.isArray(notifications) && notifications.length > 0);
  const disabled =
    notifications === false ||
    (Array.isArray(notifications) && notifications.length === 0);
  return {
    status: relevantInvalid
      ? "unknown"
      : enabled
        ? "ready"
        : disabled
          ? "disabled"
          : "ready",
    malformed: relevantInvalid,
    ...(notifications === undefined ? {} : { notifications }),
    ...(method === undefined ? {} : { method }),
    ...(condition === undefined
      ? notifications === undefined && !relevantInvalid
        ? { condition: "unfocused" }
        : {}
      : { condition }),
    effectiveDefault: notifications === undefined && !relevantInvalid,
    topLevelNotify,
  };
}

function collectTomlArray(
  lines: readonly string[],
  firstLineIndex: number,
  initialValue: string,
): { value: string; lastLineIndex: number } {
  if (!initialValue.startsWith("[") || tomlBracketDepth(initialValue) <= 0) {
    return { value: initialValue, lastLineIndex: firstLineIndex };
  }
  const values = [initialValue];
  let lastLineIndex = firstLineIndex;
  for (
    let index = firstLineIndex + 1;
    index < lines.length && values.join(" ").length <= MAX_CONFIG_BYTES;
    index += 1
  ) {
    values.push(stripTomlComment(lines[index]).trim());
    lastLineIndex = index;
    if (tomlBracketDepth(values.join(" ")) <= 0) break;
  }
  return { value: values.join(" "), lastLineIndex };
}

function tomlBracketDepth(value: string): number {
  let quote: '"' | "'" | undefined;
  let escaped = false;
  let depth = 0;
  for (const character of value) {
    if (quote === '"' && character === "\\" && !escaped) {
      escaped = true;
      continue;
    }
    if (character === quote && !escaped) quote = undefined;
    else if (!quote && (character === '"' || character === "'")) {
      quote = character;
    } else if (!quote && character === "[") depth += 1;
    else if (!quote && character === "]") depth -= 1;
    escaped = false;
  }
  return depth;
}

function parseTomlBooleanOrStringArray(
  value: string,
): boolean | string[] | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  if (!value.startsWith("[") || !value.endsWith("]")) return undefined;
  try {
    const parsed: unknown = JSON.parse(value.replace(/,\s*\]$/u, "]"));
    if (
      !Array.isArray(parsed) ||
      parsed.length > MAX_NOTIFICATION_EVENTS ||
      !parsed.every(
        (entry) =>
          typeof entry === "string" && entry.length <= MAX_SETTING_LENGTH,
      )
    ) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function parseTomlString(value: string): string | undefined {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return boundedString(JSON.parse(value));
    } catch {
      return undefined;
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return boundedString(value.slice(1, -1));
  }
  return undefined;
}

function stripTomlComment(line: string): string {
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote === '"' && character === "\\" && !escaped) {
      escaped = true;
      continue;
    }
    if (character === quote && !escaped) quote = undefined;
    else if (!quote && (character === '"' || character === "'")) quote = character;
    else if (!quote && character === "#") return line.slice(0, index);
    escaped = false;
  }
  return line;
}

function parseJsonObject(raw: string): Record<string, unknown> | undefined {
  try {
    return recordValue(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function boundedString(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= MAX_SETTING_LENGTH
    ? value
    : undefined;
}

function volumeValue(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : undefined;
}

function statusForUnreadConfig(
  fileStatus: Exclude<NotificationConfigFileStatus, "malformed">,
): NotificationReadinessStatus {
  return fileStatus === "absent" ? "not-configured" : "unknown";
}

function existenceFor(
  fileStatus: Exclude<NotificationConfigFileStatus, "malformed">,
): boolean | null {
  if (fileStatus === "absent") return false;
  if (fileStatus === "unreadable") return null;
  return true;
}

async function safeProbe(
  probe: NotificationPathProbe,
  candidate: string,
): Promise<boolean> {
  try {
    return (await probe(candidate)) === true;
  } catch {
    return false;
  }
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
