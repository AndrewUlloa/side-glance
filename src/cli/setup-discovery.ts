import { constants } from "node:fs";
import { access, open, stat } from "node:fs/promises";
import path from "node:path";

import { ConfigTargetConflictError, withConfigWriterLock } from "../adapters/config-target.ts";
import {
  applyProviderHookPlan,
  backupProviderHookPlan,
  inspectProviderHooks,
  planProviderHookInstall,
  restoreProviderHookApplication,
  revalidateProviderHookPlan,
  verifyProviderHookApplication,
  verifyProviderHookPlan,
  type InstallableProvider,
  type ProviderHookMutationApplication,
  type ProviderHookMutationPlan,
} from "../adapters/installers.ts";
import {
  applyOpenCodePluginPlan,
  backupOpenCodePluginPlan,
  inspectOpenCodePlugin,
  planOpenCodePluginInstall,
  restoreOpenCodePluginApplication,
  revalidateOpenCodePluginPlan,
  verifyOpenCodePluginApplication,
  verifyOpenCodePluginPlan,
  type OpenCodePluginMutationApplication,
  type OpenCodePluginMutationPlan,
} from "../adapters/opencode-installer.ts";
import {
  applyFreshTabsPlan,
  backupFreshTabsPlan,
  inspectFreshTabs,
  planFreshTabs,
  revalidateFreshTabsPlan,
  restoreFreshTabsApplication,
  verifyFreshTabsApplication,
  verifyFreshTabsPlan,
  type FreshTabsApplication,
  type FreshTabsPlan,
} from "../adapters/fresh-tabs.ts";
import {
  inspectNotificationReadiness,
  type NotificationPathProbe,
  type NotificationReadinessInspection,
} from "../notifications/inspection.ts";
import type { SetupDiscovery } from "./setup-command.ts";
import {
  revalidateExecutableIdentity,
  validateDurableExecutable,
  type VersionProbe,
} from "./executable.ts";
import {
  SETUP_PROVIDERS,
  createSetupPlan,
  type SetupPlanDependencies,
  type SetupFreshTabsObservation,
  type SetupGuidanceObservation,
  type SetupProvider,
  type SetupProviderObservation,
  type SetupRequest,
} from "./setup.ts";
import {
  applySetupTransaction,
  SetupTransactionError,
  type SetupTransactionParticipant,
} from "./setup-transaction.ts";

export interface DurableSetupDiscoveryOptions {
  defaultHomeDirectory: string;
  defaultExecutablePath?: string;
  expectedVersion: string;
  environment: Readonly<Record<string, string | undefined>>;
  platform: NodeJS.Platform;
  pathProbe?: NotificationPathProbe;
  probeVersion?: VersionProbe;
  beforeProviderApply?(provider: SetupProvider): void | Promise<void>;
}

interface PlannedProvider {
  provider: SetupProvider;
  observation: SetupProviderObservation;
  participant?: SetupTransactionParticipant<unknown>;
}

export async function createDurableSetupDiscovery(
  request: SetupRequest,
  options: DurableSetupDiscoveryOptions,
): Promise<SetupDiscovery> {
  const homeDirectory = path.resolve(
    request.homeDirectory ?? options.defaultHomeDirectory,
  );
  const candidateExecutablePath =
    request.executablePath ?? options.defaultExecutablePath;
  if (!candidateExecutablePath) {
    throw new Error("No stable executable invocation path was available.");
  }
  const executablePath = path.resolve(candidateExecutablePath);
  const durableExecutable = await validateDurableExecutable({
    invocationPath: executablePath,
    expectedVersion: options.expectedVersion,
    environment: options.environment,
    ...(options.probeVersion ? { probeVersion: options.probeVersion } : {}),
  });
  const pathProbe =
    options.pathProbe ??
    ((candidate: string) => probeExecutable(candidate, options.environment));
  const notifications = await inspectNotificationReadiness({
    homeDirectory,
    platform: options.platform,
    pathProbe,
    backendHints: {
      desktopSession: desktopSessionAvailable(options.platform, options.environment),
    },
  });
  const guidance = await setupGuidance(
    homeDirectory,
    options.environment,
    notifications.providers.aider.binaryAvailable,
  );
  const plannedFreshTabs =
    request.freshTabs === undefined
      ? undefined
      : await planFreshTabs({
          homeDirectory,
          environment: options.environment,
          enabled: request.freshTabs,
        });
  const freshTabs = plannedFreshTabs
    ? freshTabsObservationForPlan(plannedFreshTabs)
    : await inspectFreshTabsSafely(homeDirectory, options.environment);

  const preliminary = await planProviders({
    homeDirectory,
    executablePath: durableExecutable.invocationPath,
    environment: options.environment,
    pathProbe,
    notifications,
    selectedNotifications: new Set(request.notifications ?? []),
    notificationSound: request.notificationSound,
    migrateLegacyStoplight: request.migrateLegacyStoplight === true,
    beforeProviderApply: options.beforeProviderApply,
  });
  const preliminaryDependencies = dependenciesFor(
    homeDirectory,
    durableExecutable.invocationPath,
    notifications,
    preliminary,
    guidance,
    freshTabs,
  );
  const recommendedPlan = createSetupPlan(request, preliminaryDependencies);
  const selectedNotifications = new Set(recommendedPlan.selectedNotifications);
  const exact = await planProviders({
    homeDirectory,
    executablePath: durableExecutable.invocationPath,
    environment: options.environment,
    pathProbe,
    notifications,
    selectedNotifications,
    notificationSound: recommendedPlan.notificationSound ?? undefined,
    migrateLegacyStoplight: request.migrateLegacyStoplight === true,
    beforeProviderApply: options.beforeProviderApply,
  });
  const dependencies = dependenciesFor(
    homeDirectory,
    durableExecutable.invocationPath,
    notifications,
    exact,
    guidance,
    freshTabs,
  );
  const approvedPlan = createSetupPlan(request, dependencies);
  const participants = new Map(
    exact.flatMap((entry) =>
      entry.participant ? [[entry.provider, entry.participant] as const] : [],
    ),
  );
  const freshTabsParticipant = plannedFreshTabs
    ? createFreshTabsParticipant(plannedFreshTabs)
    : undefined;

  return {
    dependencies,
    apply: async (plan, signal) => {
      assertSameApprovedSelection(plan, approvedPlan);
      const selected = plan.selectedProviders.map((provider) => {
        const participant = participants.get(provider);
        if (!participant) {
          throw new SetupTransactionError("plan-changed");
        }
        return participant;
      });
      if (plan.freshTabs.managed) {
        if (!freshTabsParticipant) {
          throw new SetupTransactionError("plan-changed");
        }
        selected.push(freshTabsParticipant);
      }
      return await applySetupTransaction(selected, {
        withLock: (operation) =>
          withConfigWriterLock(homeDirectory, () => operation()),
        preApply: () =>
          revalidateExecutableIdentity(durableExecutable, {
            environment: options.environment,
          }),
        ...(signal ? { signal } : {}),
      });
    },
  };
}

async function planProviders(options: {
  homeDirectory: string;
  executablePath: string;
  environment: Readonly<Record<string, string | undefined>>;
  pathProbe: NotificationPathProbe;
  notifications: NotificationReadinessInspection;
  selectedNotifications: ReadonlySet<SetupProvider>;
  notificationSound?: string;
  migrateLegacyStoplight: boolean;
  beforeProviderApply?: (provider: SetupProvider) => void | Promise<void>;
}): Promise<PlannedProvider[]> {
  const stableOpenCode = await safePathProbe(options.pathProbe, "opencode");
  const openCodeV2 = await safePathProbe(options.pathProbe, "opencode2");
  return await Promise.all(
    SETUP_PROVIDERS.map(async (provider): Promise<PlannedProvider> => {
      const available =
        provider === "opencode"
          ? stableOpenCode
          : await safePathProbe(options.pathProbe, provider);
      if (
        provider === "opencode" &&
        (options.environment.OPENCODE_CONFIG ||
          options.environment.OPENCODE_CONFIG_DIR)
      ) {
        return unavailableProvider(
          provider,
          "blocked",
          "incompatible-override",
          options.notifications,
        );
      }
      if (provider === "opencode" && !stableOpenCode && openCodeV2) {
        return unavailableProvider(
          provider,
          "blocked",
          "unsupported-version",
          options.notifications,
        );
      }
      if (!available) {
        return unavailableProvider(
          provider,
          "unavailable",
          "binary-not-found",
          options.notifications,
        );
      }

      try {
        return provider === "opencode"
          ? await planOpenCode(provider, options)
          : await planJsonProvider(provider, options);
      } catch {
        return unavailableProvider(
          provider,
          "blocked",
          "unsafe-config-target",
          options.notifications,
        );
      }
    }),
  );
}

async function planJsonProvider(
  provider: InstallableProvider,
  options: Parameters<typeof planProviders>[0],
): Promise<PlannedProvider> {
  const inspection = await inspectProviderHooks({
    provider,
    homeDirectory: options.homeDirectory,
  });
  const legacyStoplightConflict = inspection.legacyStoplightHooks > 0;
  const migrateLegacyStoplight =
    provider === "claude" && options.migrateLegacyStoplight;
  const providerPlan = await planProviderHookInstall({
    provider,
    homeDirectory: options.homeDirectory,
    executablePath: options.executablePath,
    directSurface:
      !legacyStoplightConflict || migrateLegacyStoplight,
    ...(migrateLegacyStoplight
      ? { migrateLegacyStoplight: true }
      : {}),
    ...(options.selectedNotifications.has(provider)
      ? {
          notifications: true,
          ...(options.notificationSound
            ? { notificationSound: options.notificationSound }
            : {}),
        }
      : {}),
  });
  return {
    provider,
    observation: {
      provider,
      state: "eligible",
      integrationStatus: inspection.integrationStatus,
      legacyStoplightHooks: inspection.legacyStoplightHooks,
      target: {
        path: providerPlan.configPath,
        action: providerPlan.action,
        managedHookCount: inspection.expectedEvents,
      },
      nativeNotifications: nativeNotificationObservation(
        provider,
        options.notifications,
      ),
    },
    ...(!legacyStoplightConflict || migrateLegacyStoplight
      ? {
          participant: providerParticipant(
            providerPlan,
            options.beforeProviderApply,
          ),
        }
      : {}),
  };
}

async function planOpenCode(
  provider: "opencode",
  options: Parameters<typeof planProviders>[0],
): Promise<PlannedProvider> {
  const inspection = await inspectOpenCodePlugin(options.homeDirectory);
  const providerPlan = await planOpenCodePluginInstall({
    homeDirectory: options.homeDirectory,
    executablePath: options.executablePath,
    ...(options.selectedNotifications.has(provider)
      ? {
          notifications: true,
          ...(options.notificationSound
            ? { notificationSound: options.notificationSound }
            : {}),
        }
      : {}),
  });
  return {
    provider,
    observation: {
      provider,
      state: "eligible",
      integrationStatus: inspection.installed
        ? "installed"
        : inspection.status === "legacy"
          ? "partial"
          : "not-installed",
      target: {
        path: providerPlan.configPath,
        action: providerPlan.action,
        managedHookCount: 1,
      },
      nativeNotifications: nativeNotificationObservation(
        provider,
        options.notifications,
      ),
    },
    participant: openCodeParticipant(
      providerPlan,
      options.beforeProviderApply,
    ),
  };
}

function providerParticipant(
  plan: ProviderHookMutationPlan,
  beforeApply?: (provider: SetupProvider) => void | Promise<void>,
): SetupTransactionParticipant<unknown> {
  let application: ProviderHookMutationApplication | undefined;
  return {
    id: plan.provider,
    configPath: plan.configPath,
    changed: plan.changed,
    revalidate: () => revalidateProviderHookPlan(plan),
    backup: () => backupProviderHookPlan(plan),
    apply: async () => {
      await beforeApply?.(plan.provider);
      application = await applyProviderHookPlan(plan);
      return application;
    },
    verify: () =>
      application
        ? verifyProviderHookApplication(application)
        : verifyProviderHookPlan(plan),
    rollback: async (token) =>
      rollbackApplication(token, application, restoreProviderHookApplication),
  };
}

function openCodeParticipant(
  plan: OpenCodePluginMutationPlan,
  beforeApply?: (provider: SetupProvider) => void | Promise<void>,
): SetupTransactionParticipant<unknown> {
  let application: OpenCodePluginMutationApplication | undefined;
  return {
    id: plan.provider,
    configPath: plan.configPath,
    changed: plan.changed,
    revalidate: () => revalidateOpenCodePluginPlan(plan),
    backup: () => backupOpenCodePluginPlan(plan),
    apply: async () => {
      await beforeApply?.(plan.provider);
      application = await applyOpenCodePluginPlan(plan);
      return application;
    },
    verify: () =>
      application
        ? verifyOpenCodePluginApplication(application)
        : verifyOpenCodePluginPlan(plan),
    rollback: async (token) =>
      rollbackApplication(token, application, restoreOpenCodePluginApplication),
  };
}

async function rollbackApplication<Application extends object>(
  token: unknown,
  application: Application | undefined,
  restore: (application: Application) => Promise<void>,
): Promise<"restored" | "conflict"> {
  if (!application || token !== application) {
    throw new Error("Setup rollback token did not match its applied provider state.");
  }
  try {
    await restore(application);
    return "restored";
  } catch (error) {
    if (error instanceof ConfigTargetConflictError) return "conflict";
    throw error;
  }
}

function dependenciesFor(
  homeDirectory: string,
  executablePath: string,
  notifications: NotificationReadinessInspection,
  providers: readonly PlannedProvider[],
  guidance: readonly SetupGuidanceObservation[],
  freshTabs: SetupFreshTabsObservation,
): SetupPlanDependencies {
  return {
    homeDirectory,
    executablePath,
    notificationBackend: notifications.sideGlance,
    providers: providers.map(({ observation }) => observation),
    guidance,
    freshTabs,
  };
}

const AIDER_CONFIG_MAX_BYTES = 262_144;
const AIDER_BRIDGE =
  "AIDER_NOTIFICATIONS_COMMAND='side-glance notify --source aider --kind completed --json' side-glance run --label \"Aider\" -- aider";
const AIDER_REVIEW =
  "side-glance doctor --json # Existing Aider notification command detected; review it before enabling the Side Glance bridge.";

async function setupGuidance(
  homeDirectory: string,
  environment: Readonly<Record<string, string | undefined>>,
  aiderAvailable: boolean,
): Promise<SetupGuidanceObservation[]> {
  const guidance: SetupGuidanceObservation[] = [];
  if (aiderAvailable) {
    guidance.push({
      kind: "aider",
      available: true,
      command: await aiderGuidanceCommand(homeDirectory, environment),
    });
  }
  guidance.push({
    kind: "generic",
    available: true,
    command: "side-glance run --notify-on-exit -- <command>",
  });
  return guidance;
}

async function aiderGuidanceCommand(
  homeDirectory: string,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<string> {
  const environmentCommand = environment.AIDER_NOTIFICATIONS_COMMAND;
  if (environmentCommand !== undefined) {
    return isSideGlanceAiderCommand(environmentCommand)
      ? "side-glance run --label \"Aider\" -- aider"
      : AIDER_REVIEW;
  }

  const configPath = path.join(homeDirectory, ".aider.conf.yml");
  try {
    const handle = await open(configPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const metadata = await handle.stat();
      if (!metadata.isFile() || metadata.size > AIDER_CONFIG_MAX_BYTES) {
        return AIDER_REVIEW;
      }
      const raw = await handle.readFile("utf8");
      const command = configuredAiderCommand(raw);
      if (command === undefined) return AIDER_BRIDGE;
      return command !== null && isSideGlanceAiderCommand(command)
        ? "side-glance run --label \"Aider\" -- aider"
        : AIDER_REVIEW;
    } finally {
      await handle.close();
    }
  } catch (error) {
    return hasFileSystemCode(error, "ENOENT") ? AIDER_BRIDGE : AIDER_REVIEW;
  }
}

function configuredAiderCommand(raw: string): string | null | undefined {
  for (const line of raw.split(/\r?\n/u)) {
    const match = /^(?:notifications-command|notifications_command):\s*(.*)$/u.exec(
      line,
    );
    if (!match) continue;
    const value = match[1]?.trim() ?? "";
    if (value.length === 0 || value.length > 4_096) return null;
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      return value.slice(1, -1);
    }
    return value.replace(/\s+#.*$/u, "").trim() || null;
  }
  return undefined;
}

function isSideGlanceAiderCommand(command: string): boolean {
  return /(?:^|[/\s])side-glance\s+notify(?:\s|$)/u.test(command);
}

function hasFileSystemCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function unavailableProvider(
  provider: SetupProvider,
  state: "blocked" | "unavailable",
  reason: "incompatible-override" | "unsupported-version" | "binary-not-found" | "unsafe-config-target",
  notifications: NotificationReadinessInspection,
): PlannedProvider {
  return {
    provider,
    observation: {
      provider,
      state,
      integrationStatus: "unknown",
      reason,
      nativeNotifications: nativeNotificationObservation(provider, notifications),
    },
  };
}

function nativeNotificationObservation(
  provider: SetupProvider,
  inspection: NotificationReadinessInspection,
): SetupProviderObservation["nativeNotifications"] {
  if (provider === "claude") return { status: "not-configured" };
  if (provider === "codex") {
    const warningCodes = [
      ...(inspection.providers.codex.effectiveDefault
        ? (["codex-effective-default"] as const)
        : []),
      ...(inspection.providers.codex.topLevelNotify === true
        ? (["codex-custom-notify"] as const)
        : []),
    ];
    return {
      status: inspection.providers.codex.status,
      ...(warningCodes.length > 0 ? { warningCodes } : {}),
    };
  }
  if (provider === "gemini") {
    return {
      status: inspection.providers.gemini.status,
      warningCodes: ["gemini-higher-precedence"],
    };
  }
  return {
    status: inspection.providers.opencode.status,
    warningCodes: ["opencode-v1-command-unverified"],
  };
}

function assertSameApprovedSelection(
  candidate: Parameters<SetupDiscovery["apply"]>[0],
  approved: Parameters<SetupDiscovery["apply"]>[0],
): void {
  if (
    !sameStrings(candidate.selectedProviders, approved.selectedProviders) ||
    !sameStrings(candidate.selectedNotifications, approved.selectedNotifications) ||
    candidate.notificationSound !== approved.notificationSound ||
    candidate.freshTabs.managed !== approved.freshTabs.managed ||
    candidate.freshTabs.enabled !== approved.freshTabs.enabled ||
    candidate.freshTabs.target?.path !== approved.freshTabs.target?.path ||
    candidate.freshTabs.target?.action !== approved.freshTabs.target?.action
  ) {
    throw new SetupTransactionError("plan-changed");
  }
}

async function inspectFreshTabsSafely(
  homeDirectory: string,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<SetupFreshTabsObservation> {
  try {
    return await inspectFreshTabs({ homeDirectory, environment });
  } catch {
    return {
      state: "blocked",
      shell: path.basename(environment.SHELL ?? "") === "zsh" ? "zsh" : null,
      integrationStatus: "unknown",
      reason: "ownership-conflict",
    };
  }
}

function freshTabsObservationForPlan(
  plan: FreshTabsPlan,
): SetupFreshTabsObservation {
  return {
    state: "eligible",
    shell: "zsh",
    integrationStatus:
      plan.action === "remove" || (plan.enabled && plan.action === "unchanged")
        ? "installed"
        : "not-installed",
    target: {
      path: plan.configPath,
      action:
        plan.action === "create" || plan.action === "update"
          ? plan.action
          : "unchanged",
    },
  };
}

function createFreshTabsParticipant(
  plan: FreshTabsPlan,
): SetupTransactionParticipant<unknown> {
  let application: FreshTabsApplication | undefined;
  return {
    id: "fresh-tabs",
    configPath: plan.configPath,
    changed: plan.changed,
    revalidate: () => revalidateFreshTabsPlan(plan),
    backup: () => backupFreshTabsPlan(plan),
    apply: async () => {
      application = await applyFreshTabsPlan(plan);
      return application;
    },
    verify: () =>
      application
        ? verifyFreshTabsApplication(application)
        : verifyFreshTabsPlan(plan),
    rollback: async (token) =>
      rollbackApplication(token, application, restoreFreshTabsApplication),
  };
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function safePathProbe(
  probe: NotificationPathProbe,
  candidate: string,
): Promise<boolean> {
  try {
    return await probe(candidate);
  } catch {
    return false;
  }
}

async function probeExecutable(
  candidate: string,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<boolean> {
  const candidates = path.isAbsolute(candidate)
    ? [candidate]
    : (environment.PATH ?? "")
        .split(path.delimiter)
        .filter(Boolean)
        .map((directory) => path.join(directory, candidate));
  for (const executable of candidates) {
    try {
      const metadata = await stat(executable);
      if (!metadata.isFile()) continue;
      await access(executable, constants.X_OK);
      return true;
    } catch {
      // Continue without executing provider binaries.
    }
  }
  return false;
}

function desktopSessionAvailable(
  platform: NodeJS.Platform,
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  if (platform === "darwin") return true;
  if (platform === "linux") {
    return Boolean(environment.DISPLAY || environment.WAYLAND_DISPLAY);
  }
  return false;
}
