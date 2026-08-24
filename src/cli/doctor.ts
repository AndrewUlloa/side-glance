import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import { inspectOpenCodePlugin } from "../adapters/opencode-installer.ts";
import type { NotificationReadinessInspection } from "../notifications/inspection.ts";

type ProviderName = "claude" | "codex" | "gemini" | "opencode" | "aider";

export function inspectTerminalCapabilities(options: {
  platform: NodeJS.Platform;
  environment: Readonly<Record<string, string | undefined>>;
  tmux: boolean;
}) {
  const termProgram = options.environment.TERM_PROGRAM;
  const emulator =
    termProgram === "Apple_Terminal"
      ? "terminal.app"
      : termProgram === "iTerm.app"
        ? "iterm"
        : termProgram === "ghostty"
          ? "ghostty"
          : termProgram
            ? "other"
            : "unknown";
  const terminalApp = emulator === "terminal.app";
  return {
    emulator,
    background: {
      channel: "osc11",
      status: terminalApp ? "manual-verification-required" : "unverified",
    },
    titleFallback: {
      available: options.platform !== "win32" && !options.tmux,
      enabled: options.environment.SIDE_GLANCE_TERMINAL_TITLE === "1",
      optInFlag: "--terminal-title",
    },
    warnings: terminalApp
      ? [
          "Terminal.app OSC 11 background support has not been manually verified; use --terminal-title for an opt-in phase-only fallback.",
        ]
      : [],
  };
}

interface HookInspectionLike {
  expectedEvents: number;
  sideGlanceHooks: number;
  integrationStatus: "installed" | "partial" | "not-installed";
  managedHooks: unknown[];
}

export async function inspectProviderCapabilities(options: {
  homeDirectory: string;
  environment: Readonly<Record<string, string | undefined>>;
  pathProbe: (candidate: string) => boolean | Promise<boolean>;
  hooks: Readonly<Record<string, unknown>>;
  notifications: NotificationReadinessInspection;
}): Promise<{ providers: Record<ProviderName, unknown> }> {
  const providerNames = [
    "claude",
    "codex",
    "gemini",
    "opencode",
    "aider",
  ] as const;
  const binaries = Object.fromEntries(
    await Promise.all(
      providerNames.map(async (provider) => [
        provider,
        await safeProbe(options.pathProbe, provider),
      ] as const),
    ),
  ) as Record<ProviderName, boolean>;
  const openCodeV2Present = await safeProbe(options.pathProbe, "opencode2");
  const openCode = await inspectOpenCodeSafely(options.homeDirectory);
  const aiderBridge = await inspectAiderBridge(
    options.homeDirectory,
    options.environment,
  );
  const surfaceStatus = options.environment.SIDE_GLANCE_SURFACE_ID
    ? "wrapper-provided"
    : "wrapper-required";

  const providers = Object.fromEntries(
    providerNames.map((provider) => {
      const contractAudited = provider === "claude" || provider === "codex";
      const hookInspection = hookInspectionLike(options.hooks[provider]);
      const integration =
        provider === "opencode"
          ? openCode
          : provider === "aider"
            ? aiderBridge
            : {
                status: hookInspection?.integrationStatus ?? "unknown",
                installedHooks: hookInspection?.sideGlanceHooks ?? null,
                expectedHooks: hookInspection?.expectedEvents ?? null,
                managedHooks: hookInspection?.managedHooks ?? [],
              };
      const nativeNotifications =
        provider === "claude"
          ? { status: "not-inspected" }
          : options.notifications.providers[provider];
      return [
        provider,
        {
          binary:
            provider === "opencode"
              ? {
                  command: provider,
                  present: binaries[provider],
                  incompatibleV2Command: "opencode2",
                  incompatibleV2Present: openCodeV2Present,
                }
              : { command: provider, present: binaries[provider] },
          nativeNotifications,
          adapterContract: {
            status: contractAudited ? "contract-audited" : "experimental",
            completion:
              provider === "aider"
                ? "notification-only"
                : provider === "opencode"
                  ? "experimental"
                  : "pre-final",
          },
          integration,
          stableSurface: {
            status: surfaceStatus,
            supportedCommand: `side-glance run -- ${provider}`,
          },
          overrides: overrideStatus(provider, options.environment),
          liveVerification: { status: "not-run" },
        },
      ] as const;
    }),
  ) as Record<ProviderName, unknown>;
  return { providers };
}

function hookInspectionLike(value: unknown): HookInspectionLike | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<HookInspectionLike>;
  return typeof candidate.integrationStatus === "string" &&
    typeof candidate.expectedEvents === "number" &&
    typeof candidate.sideGlanceHooks === "number" &&
    Array.isArray(candidate.managedHooks)
    ? (candidate as HookInspectionLike)
    : undefined;
}

async function inspectOpenCodeSafely(homeDirectory: string) {
  try {
    return await inspectOpenCodePlugin(homeDirectory);
  } catch (error) {
    return {
      provider: "opencode" as const,
      status: "unknown" as const,
      installed: false,
      api: "v1-stable" as const,
      error: error instanceof Error ? error.message : "inspection failed",
    };
  }
}

function overrideStatus(
  provider: ProviderName,
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (provider === "gemini") {
    return { status: "higher-precedence-scopes-possible" };
  }
  if (provider === "opencode") {
    const detected = ["OPENCODE_CONFIG", "OPENCODE_CONFIG_DIR"].filter(
      (name) => environment[name],
    );
    return {
      status: detected.length > 0 ? "environment-detected" : "none-detected",
      detected,
    };
  }
  if (provider === "aider") {
    return {
      status: environment.AIDER_NOTIFICATIONS_COMMAND
        ? "environment-detected"
        : "none-detected",
    };
  }
  return { status: "none-detected" };
}

async function inspectAiderBridge(
  homeDirectory: string,
  environment: Readonly<Record<string, string | undefined>>,
) {
  const configPath = path.join(homeDirectory, ".aider.conf.yml");
  const environmentCommand = environment.AIDER_NOTIFICATIONS_COMMAND;
  if (environmentCommand !== undefined) {
    return {
      status: sideGlanceAiderCommand(environmentCommand)
        ? "configured"
        : "custom-command",
      source: "environment",
      configPath,
      higherPrecedenceOverridesPossible: true,
    };
  }
  try {
    const metadata = await lstat(configPath);
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size > 1_048_576) {
      return {
        status: "unknown",
        source: "user-config",
        configPath,
        higherPrecedenceOverridesPossible: true,
      };
    }
    const command = aiderNotificationCommand(await readFile(configPath, "utf8"));
    return {
      status:
        command === undefined
          ? "not-configured"
          : command === null
            ? "unknown"
            : sideGlanceAiderCommand(command)
              ? "configured"
              : "custom-command",
      source: command === undefined ? null : "user-config",
      configPath,
      higherPrecedenceOverridesPossible: true,
    };
  } catch (error) {
    if (hasCode(error, "ENOENT")) {
      return {
        status: "not-configured",
        source: null,
        configPath,
        higherPrecedenceOverridesPossible: true,
      };
    }
    return {
      status: "unknown",
      source: null,
      configPath,
      higherPrecedenceOverridesPossible: true,
    };
  }
}

function aiderNotificationCommand(raw: string): string | null | undefined {
  for (const line of raw.split(/\r?\n/u)) {
    const match = /^(?:notifications-command|notifications_command):\s*(.*)$/u.exec(
      line,
    );
    if (!match) continue;
    const value = match[1].trim();
    if (value.length === 0 || value.length > 4_096) return null;
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        const parsed: unknown = JSON.parse(value);
        return typeof parsed === "string" ? parsed : null;
      } catch {
        return null;
      }
    }
    if (value.startsWith("'") && value.endsWith("'")) {
      return value.slice(1, -1).replaceAll("''", "'");
    }
    return value.replace(/\s+#.*$/u, "").trim() || null;
  }
  return undefined;
}

function sideGlanceAiderCommand(command: string): boolean {
  return /(?:^|[/\s])side-glance\s+notify(?:\s|$)/u.test(command);
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

async function safeProbe(
  probe: (candidate: string) => boolean | Promise<boolean>,
  candidate: string,
): Promise<boolean> {
  try {
    return (await probe(candidate)) === true;
  } catch {
    return false;
  }
}
