import path from "node:path";

import {
  DEFAULT_NOTIFICATION_SOUND,
  MAX_NOTIFICATION_SOUND_CODE_POINTS,
} from "../notifications/policy.ts";

export const SETUP_PROVIDERS = [
  "claude",
  "codex",
  "gemini",
  "opencode",
] as const;

export type SetupProvider = (typeof SETUP_PROVIDERS)[number];
export type SetupCommand = "init" | "setup";
export type SetupExecution = "durable" | "ephemeral";
export type SetupInstallMethod = "homebrew" | "npm" | "none";

export interface SetupArgumentContext {
  command: SetupCommand;
  execution: SetupExecution;
  interactive: boolean;
}

export interface SetupRequest {
  providers?: readonly SetupProvider[];
  notifications?: readonly SetupProvider[];
  notificationsSpecified: boolean;
  migrateLegacyStoplight?: boolean;
  notificationSound?: string;
  dryRun: boolean;
  yes: boolean;
  json: boolean;
  homeDirectory?: string;
  executablePath?: string;
  installMethod?: SetupInstallMethod;
  freshTabs?: boolean;
}

export type SetupProviderState =
  | "eligible"
  | "blocked"
  | "unavailable"
  | "guidance-only";
export type SetupTargetAction = "create" | "update" | "unchanged";
export type SetupIntegrationStatus =
  | "installed"
  | "partial"
  | "not-installed"
  | "unknown";
export type SetupNativeNotificationStatus =
  | "ready"
  | "disabled"
  | "not-configured"
  | "unavailable"
  | "unknown";
export type SetupProviderReason =
  | "unsafe-config-target"
  | "incompatible-override"
  | "unsupported-version"
  | "binary-not-found"
  | "inspection-failed";
export type SetupObservationWarningCode =
  | "codex-effective-default"
  | "codex-custom-notify"
  | "gemini-higher-precedence"
  | "opencode-v1-command-unverified";

export interface SetupProviderObservation {
  provider: SetupProvider;
  state: SetupProviderState;
  integrationStatus: SetupIntegrationStatus;
  reason?: SetupProviderReason;
  legacyStoplightHooks?: number;
  target?: {
    path: string;
    action: SetupTargetAction;
    managedHookCount: number;
  };
  nativeNotifications: {
    status: SetupNativeNotificationStatus;
    warningCodes?: readonly SetupObservationWarningCode[];
  };
}

export interface SetupGuidanceObservation {
  kind: "aider" | "generic";
  available: boolean;
  command: string;
}

export interface SetupPlanDependencies {
  homeDirectory: string;
  executablePath: string;
  notificationBackend: {
    status: "available" | "unavailable" | "unsupported";
    backend: "osascript" | "notify-send" | null;
  };
  providers: readonly SetupProviderObservation[];
  guidance?: readonly SetupGuidanceObservation[];
  freshTabs?: SetupFreshTabsObservation;
}

export interface SetupFreshTabsObservation {
  state: "eligible" | "blocked" | "unavailable";
  shell: "zsh" | null;
  integrationStatus: "installed" | "not-installed" | "partial" | "unknown";
  reason?: "unsupported-shell" | "ownership-conflict";
  target?: { path: string; action: "create" | "update" | "unchanged" };
}

export interface SetupFreshTabsPlan
  extends Omit<SetupFreshTabsObservation, "target"> {
  managed: boolean;
  enabled: boolean;
  recommended: boolean;
  target?: {
    path: string;
    action: "create" | "update" | "remove" | "unchanged";
  };
}

export interface SetupPlanWarning {
  code: SetupPlanWarningCode;
  message: string;
}

export type SetupPlanWarningCode =
  | SetupObservationWarningCode
  | "duplicate-native-notifications"
  | "native-notification-status-unknown"
  | "side-glance-notifications-unavailable"
  | "side-glance-notifications-unsupported";

export interface SetupPlanProvider {
  provider: SetupProvider;
  state: SetupProviderState;
  selected: boolean;
  maturity: "contract-audited" | "experimental";
  integrationStatus: SetupIntegrationStatus;
  reason?: { code: SetupProviderReason; message: string };
  legacyStoplightHooks: number;
  migrateLegacyStoplight: boolean;
  target?: {
    path: string;
    action: SetupTargetAction;
    managedHookCount: number;
  };
  launchCommand?: string;
  notifications: {
    nativeStatus: SetupNativeNotificationStatus;
    selectable: boolean;
    defaultSelected: boolean;
    selected: boolean;
    recommendation:
      | "enable-side-glance"
      | "prefer-native"
      | "leave-off-unverified"
      | "backend-unavailable"
      | "unsupported";
    coverage: {
      ready: "covered" | "pre-final-silent";
      attention: "covered" | "not-covered";
      failure: "covered" | "not-covered";
    };
  };
  warnings: readonly SetupPlanWarning[];
}

export interface SetupPlan {
  kind: "setup-plan";
  v: 1;
  mode: "dry-run" | "apply";
  homeDirectory: string;
  executablePath: string;
  providers: readonly SetupPlanProvider[];
  selectedProviders: readonly SetupProvider[];
  selectedNotifications: readonly SetupProvider[];
  notificationSound: string | null;
  freshTabs: SetupFreshTabsPlan;
  guidance: readonly {
    kind: "aider" | "generic";
    state: "guidance-only";
    command: string;
    message: string;
  }[];
}

const REASON_MESSAGES: Readonly<Record<SetupProviderReason, string>> = {
  "unsafe-config-target":
    "The provider configuration target did not pass read-only safety checks.",
  "incompatible-override":
    "A detected override contradicts the supported global integration target.",
  "unsupported-version": "The detected provider contract is not supported.",
  "binary-not-found": "The provider command was not found without executing it.",
  "inspection-failed": "The provider integration could not be inspected safely.",
};

const WARNING_MESSAGES: Readonly<Record<SetupPlanWarningCode, string>> = {
  "codex-effective-default":
    "Codex native notifications are effectively enabled while the terminal is unfocused.",
  "codex-custom-notify":
    "Codex has a custom top-level notify command that may already deliver alerts.",
  "gemini-higher-precedence":
    "A higher-precedence Gemini configuration may override the inspected user setting.",
  "opencode-v1-command-unverified":
    "The OpenCode command matches the v1 integration contract but was not executed for a live version proof.",
  "duplicate-native-notifications":
    "Provider-native notifications are ready; enabling Side Glance may produce duplicate alerts.",
  "native-notification-status-unknown":
    "Provider-native notification readiness is unknown, so Side Glance notifications default off.",
  "side-glance-notifications-unavailable":
    "The Side Glance computer-notification backend is temporarily unavailable.",
  "side-glance-notifications-unsupported":
    "Side Glance computer notifications are unsupported on this platform.",
};

export function createSetupPlan(
  request: SetupRequest,
  dependencies: SetupPlanDependencies,
): SetupPlan {
  if (request.installMethod !== undefined) {
    throw new Error("bootstrap install selection cannot enter a durable setup plan.");
  }
  if (request.providers && request.providers.length === 0) {
    throw new Error("an explicit setup provider selection must not be empty.");
  }
  if (request.notificationsSpecified !== (request.notifications !== undefined)) {
    throw new Error("setup notification selection is incomplete.");
  }
  const homeDirectory = validateAbsolutePath(
    request.homeDirectory ?? dependencies.homeDirectory,
    "setup home directory",
  );
  const executablePath = validateAbsolutePath(
    request.executablePath ?? dependencies.executablePath,
    "Side Glance executable",
  );
  const observations = canonicalObservations(dependencies.providers);
  const requestedProviders = request.providers
    ? canonicalProviderSelection(request.providers, "provider selection")
    : observations
        .filter(({ state }) => state === "eligible")
        .map(({ provider }) => provider);

  for (const provider of requestedProviders) {
    const observation = observations.find((candidate) => candidate.provider === provider);
    if (!observation || observation.state !== "eligible") {
      throw new Error(`provider ${provider} is not eligible for setup.`);
    }
  }

  const recommendations = new Map(
    observations.map((observation) => [
      observation.provider,
      notificationRecommendation(
        observation.nativeNotifications.status,
        dependencies.notificationBackend.status,
      ),
    ]),
  );
  const requestedNotifications = request.notifications
    ? canonicalProviderSelection(request.notifications, "notification selection")
    : requestedProviders.filter(
        (provider) => recommendations.get(provider)?.defaultSelected === true,
      );
  const selectedProviderSet = new Set(requestedProviders);
  for (const provider of requestedNotifications) {
    if (!selectedProviderSet.has(provider)) {
      throw new Error(
        `notification provider ${provider} must also be selected for setup.`,
      );
    }
    if (recommendations.get(provider)?.selectable !== true) {
      throw new Error(
        `Side Glance notifications are not currently deliverable for ${provider}.`,
      );
    }
  }
  const notificationSound =
    requestedNotifications.length > 0
      ? validateNotificationSound(
          request.notificationSound ?? DEFAULT_NOTIFICATION_SOUND,
        )
      : null;
  if (request.notificationSound !== undefined && notificationSound === null) {
    throw new Error(
      "notification sound requires at least one Side Glance notification provider.",
    );
  }

  const selectedNotificationSet = new Set(requestedNotifications);
  const selectedProviders = new Set(requestedProviders);
  const providers = observations.map((observation): SetupPlanProvider => {
    const recommendation = recommendations.get(observation.provider);
    if (!recommendation) throw new Error("missing notification recommendation.");
    const warningCodes = new Set<SetupPlanWarningCode>([
      ...(observation.nativeNotifications.warningCodes ?? []),
      ...recommendation.warningCodes,
    ]);
    const target =
      observation.state === "eligible"
        ? validateTarget(observation.provider, observation.target)
        : undefined;
    return {
      provider: observation.provider,
      state: observation.state,
      selected: selectedProviders.has(observation.provider),
      maturity:
        observation.provider === "claude" || observation.provider === "codex"
          ? "contract-audited"
          : "experimental",
      integrationStatus: observation.integrationStatus,
      legacyStoplightHooks: observation.legacyStoplightHooks ?? 0,
      migrateLegacyStoplight:
        observation.provider === "claude" &&
        selectedProviders.has("claude") &&
        (observation.legacyStoplightHooks ?? 0) > 0 &&
        request.migrateLegacyStoplight === true,
      ...(observation.reason
        ? {
            reason: {
              code: observation.reason,
              message: REASON_MESSAGES[observation.reason],
            },
          }
        : {}),
      ...(target ? { target } : {}),
      ...(observation.state === "eligible"
        ? { launchCommand: launchCommand(observation.provider) }
        : {}),
      notifications: {
        nativeStatus: observation.nativeNotifications.status,
        selectable: recommendation.selectable,
        defaultSelected: recommendation.defaultSelected,
        selected: selectedNotificationSet.has(observation.provider),
        recommendation: recommendation.recommendation,
        coverage: notificationCoverage(observation.provider),
      },
      warnings: [...warningCodes].map((code) => ({
        code,
        message: WARNING_MESSAGES[code],
      })),
    };
  });

  const freshTabs = createFreshTabsPlan(request, dependencies.freshTabs);

  return {
    kind: "setup-plan",
    v: 1,
    mode: request.dryRun ? "dry-run" : "apply",
    homeDirectory,
    executablePath,
    providers,
    selectedProviders: requestedProviders,
    selectedNotifications: requestedNotifications,
    notificationSound,
    freshTabs,
    guidance: projectGuidance(dependencies.guidance ?? []),
  };
}

function canonicalObservations(
  observations: readonly SetupProviderObservation[],
): SetupProviderObservation[] {
  const byProvider = new Map<SetupProvider, SetupProviderObservation>();
  for (const observation of observations) {
    if (!(SETUP_PROVIDERS as readonly string[]).includes(observation.provider)) {
      throw new Error("setup discovery returned an unknown provider.");
    }
    if (byProvider.has(observation.provider)) {
      throw new Error(`setup discovery returned duplicate ${observation.provider}.`);
    }
    if (
      !["eligible", "blocked", "unavailable", "guidance-only"].includes(
        observation.state,
      )
    ) {
      throw new Error(`setup discovery returned an invalid ${observation.provider} state.`);
    }
    if (
      !["installed", "partial", "not-installed", "unknown"].includes(
        observation.integrationStatus,
      )
    ) {
      throw new Error(
        `setup discovery returned an invalid ${observation.provider} integration status.`,
      );
    }
    if (
      !["ready", "disabled", "not-configured", "unavailable", "unknown"].includes(
        observation.nativeNotifications.status,
      )
    ) {
      throw new Error(
        `setup discovery returned an invalid ${observation.provider} notification status.`,
      );
    }
    for (const code of observation.nativeNotifications.warningCodes ?? []) {
      if (!Object.hasOwn(WARNING_MESSAGES, code)) {
        throw new Error(
          `setup discovery returned an invalid ${observation.provider} warning.`,
        );
      }
    }
    if (
      observation.reason &&
      !Object.hasOwn(REASON_MESSAGES, observation.reason)
    ) {
      throw new Error(`setup discovery returned an invalid ${observation.provider} reason.`);
    }
    if (
      observation.legacyStoplightHooks !== undefined &&
      (!Number.isSafeInteger(observation.legacyStoplightHooks) ||
        observation.legacyStoplightHooks < 0)
    ) {
      throw new Error(
        `setup discovery returned an invalid ${observation.provider} legacy Stoplight hook count.`,
      );
    }
    byProvider.set(observation.provider, observation);
  }
  return SETUP_PROVIDERS.map((provider) => {
    const observation = byProvider.get(provider);
    if (!observation) {
      throw new Error(`setup discovery did not report ${provider}.`);
    }
    return observation;
  });
}

function canonicalProviderSelection(
  providers: readonly SetupProvider[],
  description: string,
): SetupProvider[] {
  const selected = new Set<SetupProvider>();
  for (const provider of providers) {
    if (!(SETUP_PROVIDERS as readonly string[]).includes(provider)) {
      throw new Error(`${description} contains an unknown provider.`);
    }
    if (selected.has(provider)) {
      throw new Error(`${description} contains a duplicate provider.`);
    }
    selected.add(provider);
  }
  return SETUP_PROVIDERS.filter((provider) => selected.has(provider));
}

function notificationRecommendation(
  nativeStatus: SetupNativeNotificationStatus,
  backendStatus: SetupPlanDependencies["notificationBackend"]["status"],
): {
  selectable: boolean;
  defaultSelected: boolean;
  recommendation: SetupPlanProvider["notifications"]["recommendation"];
  warningCodes: readonly SetupPlanWarningCode[];
} {
  if (backendStatus === "unsupported") {
    return {
      selectable: false,
      defaultSelected: false,
      recommendation: "unsupported",
      warningCodes: ["side-glance-notifications-unsupported"],
    };
  }
  if (backendStatus === "unavailable") {
    return {
      selectable: false,
      defaultSelected: false,
      recommendation: "backend-unavailable",
      warningCodes: ["side-glance-notifications-unavailable"],
    };
  }
  if (nativeStatus === "ready") {
    return {
      selectable: true,
      defaultSelected: false,
      recommendation: "prefer-native",
      warningCodes: ["duplicate-native-notifications"],
    };
  }
  if (nativeStatus === "unknown") {
    return {
      selectable: true,
      defaultSelected: false,
      recommendation: "leave-off-unverified",
      warningCodes: ["native-notification-status-unknown"],
    };
  }
  return {
    selectable: true,
    defaultSelected: true,
    recommendation: "enable-side-glance",
    warningCodes: [],
  };
}

function validateTarget(
  provider: SetupProvider,
  target: SetupProviderObservation["target"],
): NonNullable<SetupPlanProvider["target"]> {
  if (!target) throw new Error(`eligible provider ${provider} has no setup target.`);
  if (!["create", "update", "unchanged"].includes(target.action)) {
    throw new Error(`provider ${provider} has an invalid setup action.`);
  }
  if (!Number.isSafeInteger(target.managedHookCount) || target.managedHookCount < 0) {
    throw new Error(`provider ${provider} has an invalid managed hook count.`);
  }
  return {
    path: validateAbsolutePath(target.path, `${provider} configuration path`),
    action: target.action,
    managedHookCount: target.managedHookCount,
  };
}

function notificationCoverage(
  provider: SetupProvider,
): SetupPlanProvider["notifications"]["coverage"] {
  if (provider === "opencode") {
    return { ready: "covered", attention: "covered", failure: "covered" };
  }
  return {
    ready: "pre-final-silent",
    attention: "covered",
    failure: provider === "claude" ? "covered" : "not-covered",
  };
}

function launchCommand(provider: SetupProvider): string {
  if (provider !== "opencode") return provider;
  const labels: Readonly<Record<SetupProvider, string>> = {
    claude: "Claude",
    codex: "Codex",
    gemini: "Gemini",
    opencode: "OpenCode",
  };
  return `side-glance run --label "${labels[provider]}" -- ${provider}`;
}

function projectGuidance(
  guidance: readonly SetupGuidanceObservation[],
): SetupPlan["guidance"] {
  const seen = new Set<SetupGuidanceObservation["kind"]>();
  return guidance.flatMap((entry) => {
    if (seen.has(entry.kind)) {
      throw new Error(`setup guidance returned duplicate ${entry.kind}.`);
    }
    seen.add(entry.kind);
    if (!entry.available) return [];
    if (
      entry.command.length === 0 ||
      [...entry.command].length > 1024 ||
      containsControlCharacter(entry.command)
    ) {
      throw new Error(`setup ${entry.kind} guidance command is unsafe.`);
    }
    return [
      {
        kind: entry.kind,
        state: "guidance-only" as const,
        command: entry.command,
        message:
          entry.kind === "aider"
            ? "Aider remains a manual notification bridge; setup will not replace its notification command."
            : "Use the supervised wrapper for commands without a managed provider integration.",
      },
    ];
  });
}

const VALUE_OPTIONS = new Set([
  "--providers",
  "--notifications",
  "--notification-sound",
  "--home",
  "--executable",
  "--install",
]);
const BOOLEAN_OPTIONS = new Set([
  "--dry-run",
  "--yes",
  "--json",
  "--migrate-legacy-stoplight",
  "--fresh-tabs",
  "--no-fresh-tabs",
]);

export function parseSetupArguments(
  args: readonly string[],
  context: SetupArgumentContext,
): SetupRequest {
  const values = new Map<string, string>();
  const booleans = new Set<string>();
  const seen = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument || (!VALUE_OPTIONS.has(argument) && !BOOLEAN_OPTIONS.has(argument))) {
      throw new Error(`setup received an unknown option: ${argument ?? ""}.`);
    }
    if (seen.has(argument)) {
      throw new Error(`setup received duplicate option ${argument}.`);
    }
    seen.add(argument);
    if (BOOLEAN_OPTIONS.has(argument)) {
      booleans.add(argument);
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    values.set(argument, value);
    index += 1;
  }

  const providers = values.has("--providers")
    ? parseProviderList(values.get("--providers") as string, "--providers")
    : undefined;
  const notificationsSpecified = values.has("--notifications");
  const notifications = notificationsSpecified
    ? parseNotificationList(values.get("--notifications") as string)
    : undefined;
  const notificationSound = values.has("--notification-sound")
    ? validateNotificationSound(values.get("--notification-sound") as string)
    : undefined;
  const dryRun = booleans.has("--dry-run");
  const yes = booleans.has("--yes");
  const json = booleans.has("--json");
  const migrateLegacyStoplight = booleans.has("--migrate-legacy-stoplight");
  if (booleans.has("--fresh-tabs") && booleans.has("--no-fresh-tabs")) {
    throw new Error("--fresh-tabs and --no-fresh-tabs cannot be used together.");
  }
  const freshTabs = booleans.has("--fresh-tabs")
    ? true
    : booleans.has("--no-fresh-tabs")
      ? false
      : undefined;
  const homeDirectory = values.has("--home")
    ? validateAbsolutePath(values.get("--home") as string, "--home")
    : undefined;
  const executablePath = values.has("--executable")
    ? validateAbsolutePath(values.get("--executable") as string, "--executable")
    : undefined;
  const installMethod = values.has("--install")
    ? parseInstallMethod(values.get("--install") as string)
    : undefined;

  if (installMethod !== undefined) {
    if (context.execution !== "ephemeral" || context.command !== "init") {
      throw new Error(
        "--install is accepted only by ephemeral `npx side-glance init`.",
      );
    }
    if (installMethod === "none" && !dryRun) {
      throw new Error("--install none requires --dry-run.");
    }
  }
  if (context.execution === "ephemeral" && context.command === "setup" && !dryRun) {
    throw new Error(
      "Ephemeral setup cannot change provider configuration; use init to bootstrap a durable installation or add --dry-run.",
    );
  }
  if (notificationSound !== undefined && (!notifications || notifications.length === 0)) {
    throw new Error(
      "--notification-sound requires a non-empty --notifications provider list.",
    );
  }
  if (notifications && !providers) {
    throw new Error("--notifications requires --providers.");
  }
  if (providers && notifications) {
    const selected = new Set(providers);
    const outsideSelection = notifications.find((provider) => !selected.has(provider));
    if (outsideSelection) {
      throw new Error(
        `notification provider ${outsideSelection} must also be selected with --providers.`,
      );
    }
  }
  if (migrateLegacyStoplight && !providers?.includes("claude")) {
    throw new Error("--migrate-legacy-stoplight requires Claude in --providers.");
  }
  if (dryRun && yes) {
    throw new Error("--dry-run and --yes cannot be used together.");
  }
  if (yes && (!providers || !notificationsSpecified)) {
    throw new Error(
      "--yes requires both --providers and an explicit --notifications list (or none).",
    );
  }
  if (json && !dryRun && !yes) {
    throw new Error(
      "--json requires --dry-run or a fully specified --yes setup plan.",
    );
  }
  if (!context.interactive && !dryRun && !yes) {
    throw new Error(
      "Non-interactive setup requires --dry-run or --yes with --providers and --notifications.",
    );
  }

  return {
    ...(providers ? { providers } : {}),
    ...(notifications ? { notifications } : {}),
    notificationsSpecified,
    ...(migrateLegacyStoplight ? { migrateLegacyStoplight: true } : {}),
    ...(notificationSound ? { notificationSound } : {}),
    dryRun,
    yes,
    json,
    ...(homeDirectory ? { homeDirectory } : {}),
    ...(executablePath ? { executablePath } : {}),
    ...(installMethod ? { installMethod } : {}),
    ...(freshTabs === undefined ? {} : { freshTabs }),
  };
}

function createFreshTabsPlan(
  request: SetupRequest,
  observation: SetupFreshTabsObservation | undefined,
): SetupFreshTabsPlan {
  const current: SetupFreshTabsObservation =
    observation ??
    ({
      state: "unavailable",
      shell: null,
      integrationStatus: "unknown",
      reason: "unsupported-shell",
    } as const);
  const managed = request.freshTabs !== undefined;
  if (request.freshTabs === true && current.state !== "eligible") {
    throw new Error("fresh terminal tabs are not eligible for setup.");
  }
  if (request.freshTabs === false && current.state === "blocked") {
    throw new Error("fresh terminal tab ownership markers must be repaired manually.");
  }
  const installed = current.integrationStatus === "installed";
  const enabled = request.freshTabs ?? installed;
  const target = current.target
    ? {
        path: validateAbsolutePath(
          current.target.path,
          "fresh terminal tab configuration path",
        ),
        action:
          managed && !enabled && installed
            ? ("remove" as const)
            : current.target.action,
      }
    : undefined;
  return {
    ...current,
    managed,
    enabled,
    recommended: current.state === "eligible",
    ...(target ? { target } : {}),
  };
}

function parseProviderList(value: string, option: string): SetupProvider[] {
  if (value.length === 0) throw new Error(`${option} must not be empty.`);
  const raw = value.split(",");
  if (raw.some((provider) => provider.length === 0)) {
    throw new Error(`${option} contains an empty provider.`);
  }
  const parsed = raw.map((provider) => parseProvider(provider, option));
  const unique = new Set(parsed);
  if (unique.size !== parsed.length) {
    throw new Error(`${option} contains a duplicate provider.`);
  }
  return SETUP_PROVIDERS.filter((provider) => unique.has(provider));
}

function parseNotificationList(value: string): SetupProvider[] {
  if (value === "none") return [];
  if (value.split(",").includes("none")) {
    throw new Error("--notifications cannot combine none with providers.");
  }
  return parseProviderList(value, "--notifications");
}

function parseProvider(value: string, option: string): SetupProvider {
  if ((SETUP_PROVIDERS as readonly string[]).includes(value)) {
    return value as SetupProvider;
  }
  throw new Error(
    `${option} provider must be claude, codex, gemini, or opencode.`,
  );
}

function parseInstallMethod(value: string): SetupInstallMethod {
  if (value === "homebrew" || value === "npm" || value === "none") return value;
  throw new Error("--install must be homebrew, npm, or none.");
}

function validateAbsolutePath(value: string, option: string): string {
  if (!path.isAbsolute(value)) throw new Error(`${option} must be an absolute path.`);
  if (containsControlCharacter(value)) {
    throw new Error(`${option} may not contain control characters.`);
  }
  return path.resolve(value);
}

function validateNotificationSound(value: string): string {
  const normalized = value.normalize("NFC");
  if (
    normalized.trim() !== normalized ||
    normalized.length === 0 ||
    [...normalized].length > MAX_NOTIFICATION_SOUND_CODE_POINTS ||
    normalized.startsWith("--") ||
    normalized.includes("/") ||
    containsControlCharacter(normalized)
  ) {
    throw new Error(
      `notification sound must be a safe installed sound name of 1 to ${MAX_NOTIFICATION_SOUND_CODE_POINTS} characters.`,
    );
  }
  return normalized || DEFAULT_NOTIFICATION_SOUND;
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}
