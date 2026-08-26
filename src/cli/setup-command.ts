import type { SideGlanceConfigInspection } from "../core/appearance.ts";
import { DEFAULT_NOTIFICATION_SOUND } from "../notifications/policy.ts";
import {
  createReadlineSetupPrompter,
  sanitizePromptDetail,
  type PromptOutcome,
  type SetupPrompter,
} from "./prompts.ts";
import {
  SETUP_PROVIDERS,
  createSetupPlan,
  parseSetupArguments,
  type SetupCommand,
  type SetupExecution,
  type SetupPlan,
  type SetupPlanDependencies,
  type SetupProvider,
  type SetupRequest,
} from "./setup.ts";
import {
  SetupTransactionError,
  type SetupTransactionResult,
} from "./setup-transaction.ts";

export interface SetupDiscovery {
  dependencies: SetupPlanDependencies;
  apply(
    plan: SetupPlan,
    signal?: AbortSignal,
  ): Promise<SetupTransactionResult>;
}

export interface SetupCommandOptions {
  execution: SetupExecution;
  interactive: boolean;
  discover(request: SetupRequest): Promise<SetupDiscovery>;
  writeStdout(value: string): void;
  writeStderr(value: string): void;
  prompter?: SetupPrompter;
  signal?: AbortSignal;
  appearance?: SideGlanceConfigInspection;
}

export async function runSetupCommand(
  command: SetupCommand,
  args: readonly string[],
  options: SetupCommandOptions,
): Promise<number> {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    options.writeStdout(setupHelpText());
    return 0;
  }

  const json = args.includes("--json");
  let request: SetupRequest;
  try {
    request = parseSetupArguments(args, {
      command,
      execution: options.execution,
      interactive: options.interactive,
    });
  } catch {
    return writeSetupFailure(options, json, "invalid-options");
  }

  if (options.signal?.aborted) {
    writeSetupFailure(options, request.json, "interrupted");
    return 130;
  }

  if (options.interactive && !request.dryRun && !request.yes) {
    return await runInteractiveSetup(request, options);
  }
  return await runAutomatedSetup(request, options);
}

export function setupHelpText(): string {
  return `Guided Side Glance setup

Usage:
  side-glance init [--dry-run | --yes --providers <list> --notifications <list|none>]
  side-glance setup [--dry-run | --yes --providers <list> --notifications <list|none>]

Options:
  --providers <list>           Claude, Codex, Gemini, and/or OpenCode
  --notifications <list|none>  Side Glance computer-notification channels
  --notification-sound <name>  Installed sound name (default: Glass)
  --dry-run                    Inspect the exact redacted plan without writing
  --yes                        Apply a fully specified non-interactive plan
  --json                       Emit exactly one versioned JSON result
  --home <absolute-path>       Override the inspected home directory
  --executable <absolute-path> Override the durable Side Glance executable
  -h, --help                   Show this help without detection or writes

Safety:
  A caught apply or verification failure rolls back completed writes when safe.
  Power loss or SIGKILL can leave partial setup; the next init or doctor repairs it.
`;
}

async function runAutomatedSetup(
  request: SetupRequest,
  options: SetupCommandOptions,
): Promise<number> {
  const planned = await discoverPlan(request, options);
  if (!planned.ok) return planned.code;
  if (request.dryRun) {
    writeSetupPlan(planned.plan, request.json, options);
    return 0;
  }
  return await applyPlan(planned.discovery, planned.plan, request.json, options);
}

async function runInteractiveSetup(
  initialRequest: SetupRequest,
  options: SetupCommandOptions,
): Promise<number> {
  const prompter =
    options.prompter ??
    createReadlineSetupPrompter({
      input: process.stdin,
      output: process.stdout,
      signal: options.signal,
    });
  try {
    const preliminary = await discoverPlan(initialRequest, options);
    if (!preliminary.ok) return preliminary.code;
    if (options.signal?.aborted) return interruptedSetup(options, false);
    prompter.note("Side Glance");
    prompter.note("");
    renderProviderSummary(preliminary.plan, prompter);
    const eligible = preliminary.plan.providers.filter(
      ({ state }) => state === "eligible",
    );
    if (eligible.length === 0) {
      const everyProviderCommandIsMissing = preliminary.plan.providers.every(
        ({ reason }) => reason?.code === "binary-not-found",
      );
      prompter.note(
        everyProviderCommandIsMissing
          ? "No provider CLI commands were found. Nothing was changed."
          : "No provider integrations can be configured safely. Nothing was changed.",
      );
      renderGuidance(preliminary.plan, prompter);
      return 0;
    }

    const hasFixedSelections =
      initialRequest.providers !== undefined ||
      initialRequest.notificationsSpecified ||
      initialRequest.notificationSound !== undefined;
    let setupMode: "recommended" | "customize" = "customize";
    if (!hasFixedSelections) {
      const selectedMode = await prompter.select(
        "How would you like to continue?",
        [
          {
            id: "recommended",
            label: recommendedChoiceLabel(preliminary.plan),
            selected: true,
          },
          {
            id: "customize",
            label: "Customize providers and computer notifications",
          },
          { id: "exit", label: "Exit without making changes" },
        ],
      );
      if (selectedMode.status === "cancelled") {
        return cancellationCode(selectedMode);
      }
      if (selectedMode.value === "exit") {
        prompter.note("Setup cancelled. Nothing was changed.");
        return 0;
      }
      setupMode =
        selectedMode.value === "recommended" ? "recommended" : "customize";
    }

    const selectedProviderValues = initialRequest.providers
      ? [...initialRequest.providers]
      : setupMode === "recommended"
        ? [...preliminary.plan.selectedProviders]
        : await promptForProviders(preliminary.plan, prompter, options);
    if (!Array.isArray(selectedProviderValues)) return selectedProviderValues;
    if (selectedProviderValues.length === 0) {
      prompter.note("No providers selected. Nothing was changed.");
      renderGuidance(preliminary.plan, prompter);
      return 0;
    }
    if (initialRequest.providers) {
      prompter.note(
        `Provider selection fixed by --providers: ${initialRequest.providers.join(", ")}`,
      );
    }
    if (options.signal?.aborted) return interruptedSetup(options, false);

    const selectedNotificationValues = initialRequest.notificationsSpecified
      ? [...(initialRequest.notifications ?? [])]
      : setupMode === "recommended"
        ? [...preliminary.plan.selectedNotifications]
      : await promptForNotifications(
          preliminary.plan,
          selectedProviderValues,
          prompter,
          options,
        );
    if (!Array.isArray(selectedNotificationValues)) {
      return selectedNotificationValues;
    }
    if (initialRequest.notificationsSpecified) {
      prompter.note(
        `Notification selection fixed by --notifications: ${selectedNotificationValues.length > 0 ? selectedNotificationValues.join(", ") : "none"}`,
      );
    }
    if (options.signal?.aborted) return interruptedSetup(options, false);

    let notificationSound: string | undefined;
    if (selectedNotificationValues.length > 0) {
      if (initialRequest.notificationSound !== undefined) {
        notificationSound = initialRequest.notificationSound;
      } else if (setupMode === "recommended") {
        notificationSound =
          preliminary.plan.notificationSound ?? DEFAULT_NOTIFICATION_SOUND;
      } else {
        renderSoundGuidance(preliminary.discovery.dependencies, prompter);
        while (notificationSound === undefined) {
          const selectedSound = await prompter.text(
            "Notification sound",
            preliminary.plan.notificationSound ?? DEFAULT_NOTIFICATION_SOUND,
          );
          if (selectedSound.status === "cancelled") {
            return cancellationCode(selectedSound);
          }
          if (options.signal?.aborted) return interruptedSetup(options, false);
          if (
            interactiveSoundIsValid(
              selectedSound.value,
              initialRequest,
              selectedProviderValues,
              selectedNotificationValues,
              preliminary.discovery.dependencies,
            )
          ) {
            notificationSound = selectedSound.value;
          } else {
            prompter.note(
              "Enter a safe installed sound name without slashes, control characters, or leading dashes.",
            );
          }
        }
      }
    }

    const request: SetupRequest = {
      ...initialRequest,
      providers: canonicalPromptProviders(selectedProviderValues),
      notifications: canonicalPromptProviders(selectedNotificationValues),
      notificationsSpecified: true,
      ...(notificationSound === undefined ? {} : { notificationSound }),
    };
    const finalPlan = await discoverPlan(request, options);
    if (!finalPlan.ok) return finalPlan.code;
    if (options.signal?.aborted) return interruptedSetup(options, false);
    renderPlanNotes(finalPlan.plan, prompter, options.appearance);
    const confirmation = await prompter.confirm("Apply this setup plan?", true);
    if (confirmation.status === "cancelled") {
      return cancellationCode(confirmation);
    }
    if (options.signal?.aborted) return interruptedSetup(options, false);
    if (!confirmation.value) {
      prompter.note("Setup cancelled. Nothing was changed.");
      return 0;
    }
    prompter.startProgress?.("Writing and verifying provider configuration…");
    return await applyPlan(finalPlan.discovery, finalPlan.plan, false, options, {
      success: () =>
        prompter.stopProgress?.("Configuration saved.", true),
      failure: () =>
        prompter.stopProgress?.(
          "Provider configuration could not be verified.",
          false,
        ),
      renderResult: (plan, result) =>
        humanInteractiveSetupResult(plan, result, options.appearance),
    });
  } finally {
    prompter.close();
  }
}

async function discoverPlan(
  request: SetupRequest,
  options: SetupCommandOptions,
): Promise<
  | { ok: true; discovery: SetupDiscovery; plan: SetupPlan }
  | { ok: false; code: number }
> {
  try {
    if (options.signal?.aborted) {
      return {
        ok: false,
        code: interruptedSetup(options, request.json),
      };
    }
    const discovery = await options.discover(request);
    if (options.signal?.aborted) {
      return {
        ok: false,
        code: interruptedSetup(options, request.json),
      };
    }
    return {
      ok: true,
      discovery,
      plan: createSetupPlan(request, discovery.dependencies),
    };
  } catch {
    if (options.signal?.aborted) {
      return {
        ok: false,
        code: interruptedSetup(options, request.json),
      };
    }
    return {
      ok: false,
      code: writeSetupFailure(options, request.json, "planning-failed"),
    };
  }
}

async function applyPlan(
  discovery: SetupDiscovery,
  plan: SetupPlan,
  json: boolean,
  options: SetupCommandOptions,
  presentation?: {
    success(): void;
    failure(): void;
    renderResult?(plan: SetupPlan, result: SetupTransactionResult): string[];
  },
): Promise<number> {
  let progressFinished = false;
  try {
    if (options.signal?.aborted) {
      presentation?.failure();
      progressFinished = true;
      return interruptedSetup(options, json);
    }
    const result = await discovery.apply(plan, options.signal);
    const projected = projectSetupResult(plan, result);
    const output = json
      ? `${JSON.stringify(projected)}\n`
      : `${(presentation?.renderResult ?? humanSetupResult)(plan, result).join("\n")}\n`;
    presentation?.success();
    progressFinished = true;
    options.writeStdout(output);
    return 0;
  } catch (error) {
    if (!progressFinished) presentation?.failure();
    const code =
      error instanceof SetupTransactionError ? error.code : "apply-failed";
    const failure = writeSetupFailure(options, json, code);
    return code === "interrupted" ? 130 : failure;
  }
}

function writeSetupPlan(
  plan: SetupPlan,
  json: boolean,
  options: SetupCommandOptions,
): void {
  const projected = projectSetupPlan(plan);
  if (json) {
    options.writeStdout(`${JSON.stringify(projected)}\n`);
    return;
  }
  options.writeStdout(`${humanSetupPlan(plan).join("\n")}\n`);
}

export function projectSetupPlan(plan: SetupPlan) {
  return {
    schemaVersion: 1 as const,
    kind: "setup-plan" as const,
    mode: plan.mode,
    executablePath: plan.executablePath,
    providers: plan.providers.flatMap((provider) =>
      provider.selected && provider.target
        ? [
            {
              id: provider.provider,
              state: provider.state,
              maturity: provider.maturity,
              integrationStatus: provider.integrationStatus,
              target: {
                path: provider.target.path,
                action: provider.target.action,
                managedHookCount: provider.target.managedHookCount,
              },
              notifications: {
                selected: provider.notifications.selected,
                nativeStatus: provider.notifications.nativeStatus,
                recommendation: provider.notifications.recommendation,
                coverage: provider.notifications.coverage,
              },
              warnings: provider.warnings.map(({ code, message }) => ({
                code,
                message,
              })),
              ...(provider.launchCommand
                ? { launchCommand: provider.launchCommand }
                : {}),
            },
          ]
        : [],
    ),
    notificationSound: plan.notificationSound,
    guidance: plan.guidance,
  };
}

function renderPlanNotes(
  plan: SetupPlan,
  prompter: SetupPrompter,
  appearance?: SideGlanceConfigInspection,
): void {
  prompter.note("Review");
  prompter.note("");
  writePromptDetail(
    prompter,
    `  Providers: ${humanList(plan.selectedProviders.map(providerLabel))}`,
  );
  writePromptDetail(
    prompter,
    plan.selectedNotifications.length === 0
      ? "  Computer notifications: Off"
      : `  Computer notifications: ${humanList(plan.selectedNotifications.map(providerLabel))} · ${plan.notificationSound ?? DEFAULT_NOTIFICATION_SOUND}`,
  );
  writePromptDetail(
    prompter,
    `  ${setupColorSummary(appearance)}`,
  );
  writePromptDetail(prompter, "  Configuration:");
  for (const provider of plan.providers) {
    if (!provider.selected || !provider.target) continue;
    writePromptDetail(
      prompter,
      `    ${providerLabel(provider.provider)}: ${displayHomeRelativePath(provider.target.path, plan.homeDirectory)}${provider.maturity === "experimental" ? " (experimental)" : ""}`,
    );
  }
  for (const provider of plan.providers) {
    if (!provider.selected) continue;
    for (const warning of provider.warnings) {
      writePromptDetail(
        prompter,
        `  Warning: ${interactiveWarningMessage(warning.code)}`,
      );
    }
  }
  if (plan.selectedNotifications.length > 0) {
    writePromptDetail(
      prompter,
      "  No live notification will be sent during setup.",
    );
  }
  prompter.note("");
}

function humanSetupPlan(plan: SetupPlan, dryRun = true): string[] {
  const lines = [
    "Side Glance setup plan:",
    `Durable executable: ${plan.executablePath}`,
    "Detected providers:",
  ];
  for (const provider of plan.providers) {
    const selected = provider.selected ? "selected" : "not selected";
    const reason = provider.reason ? `; ${provider.reason.message}` : "";
    lines.push(
      `  ${providerLabel(provider.provider)}: ${provider.state}; ${selected}; ${provider.maturity}; current integration ${provider.integrationStatus}${reason}`,
    );
  }
  lines.push("Approved provider changes:");
  for (const provider of plan.providers) {
    if (!provider.selected || !provider.target) continue;
    lines.push(
      `  ${providerLabel(provider.provider)}: ${provider.target.action}; maturity ${provider.maturity}; current integration ${provider.integrationStatus}`,
      `    configuration: ${provider.target.path}`,
      `    managed hooks: ${provider.target.managedHookCount}`,
      `    computer notifications: ${provider.notifications.selected ? "on" : "off"}; native ${provider.notifications.nativeStatus}; ${notificationRecommendationDescription(provider)}`,
      `    coverage: ${coverageDescription(provider)}`,
    );
    for (const warning of provider.warnings) {
      lines.push(`    warning: ${warning.message}`);
    }
    if (provider.launchCommand) lines.push(`    launch: ${provider.launchCommand}`);
  }
  if (plan.notificationSound) {
    lines.push(`Notification sound: ${plan.notificationSound}`);
  }
  lines.push(
    "Installed hooks provide lifecycle semantics; side-glance run provides the stable terminal surface identity used for reliable colors.",
    "A caught apply or verification failure rolls back completed provider writes when they still match this setup.",
    "Power loss or SIGKILL between provider writes can leave partial setup; the next side-glance init or side-glance doctor reports it for repair.",
  );
  appendGuidanceLines(lines, plan);
  if (dryRun) lines.push("No changes were written.");
  return lines;
}

function projectSetupResult(
  plan: SetupPlan,
  result: SetupTransactionResult,
) {
  const byProvider = new Map(plan.providers.map((provider) => [provider.provider, provider]));
  return {
    schemaVersion: 1 as const,
    kind: "setup-result" as const,
    executablePath: plan.executablePath,
    providers: result.providers.map((resultProvider) => {
      const provider = byProvider.get(resultProvider.id as SetupProvider);
      return {
        ...resultProvider,
        integrationStatus: "installed" as const,
        verificationStatus: "verified" as const,
        ...(provider
          ? {
              maturity: provider.maturity,
              notifications: {
                selected: provider.notifications.selected,
                nativeStatus: provider.notifications.nativeStatus,
                coverage: provider.notifications.coverage,
              },
              warnings: provider.warnings,
              ...(provider.launchCommand
                ? { launchCommand: provider.launchCommand }
                : {}),
            }
          : {}),
      };
    }),
    notificationSound: plan.notificationSound,
    guidance: plan.guidance,
  };
}

function humanSetupResult(
  plan: SetupPlan,
  result: SetupTransactionResult,
): string[] {
  const projected = projectSetupResult(plan, result);
  const lines = [
    "Setup complete. Provider configuration verified.",
    `Durable executable: ${projected.executablePath}`,
  ];
  for (const provider of projected.providers) {
    lines.push(
      `${providerLabel(provider.id as SetupProvider)}: ${provider.changed ? "changed" : "unchanged"}; integration installed and verified`,
      `  configuration: ${provider.configPath}`,
    );
    if (provider.backupPath) lines.push(`  backup: ${provider.backupPath}`);
    lines.push(
      provider.notifications?.selected
        ? `  ${providerLabel(provider.id as SetupProvider)} alerts: ${coverageDescriptionFromCoverage(provider.notifications.coverage)}`
        : `  ${providerLabel(provider.id as SetupProvider)} alerts: off`,
    );
    for (const warning of provider.warnings ?? []) {
      lines.push(`  warning: ${warning.message}`);
    }
    if (provider.launchCommand) lines.push(`  launch: ${provider.launchCommand}`);
  }
  if (projected.notificationSound) {
    lines.push(`Notification sound: ${projected.notificationSound}`);
    lines.push(
      "Computer notifications are configured; delivery and sound were not live-tested.",
    );
  }
  lines.push(
    "Hooks provide lifecycle events; use the launch commands above to provide a stable terminal surface identity for reliable colors.",
  );
  appendGuidanceLines(lines, plan);
  return lines;
}

function humanInteractiveSetupResult(
  plan: SetupPlan,
  result: SetupTransactionResult,
  appearance?: SideGlanceConfigInspection,
): string[] {
  const projected = projectSetupResult(plan, result);
  const lines = ["✓ Side Glance is ready", ""];
  for (const provider of projected.providers) {
    lines.push(
      `  ${providerLabel(provider.id as SetupProvider)} ${provider.changed ? "configured" : "already configured"}`,
    );
  }
  lines.push(
    plan.selectedNotifications.length > 0
      ? `  Computer notifications enabled · ${plan.notificationSound ?? DEFAULT_NOTIFICATION_SOUND} (delivery not tested)`
      : "  Computer notifications off",
    `  ${setupColorSummary(appearance)}`,
    "  Change anytime: side-glance theme",
  );

  const launchCommands = projected.providers.flatMap((provider) =>
    provider.launchCommand ? [provider.launchCommand] : [],
  );
  const fallbackCommand = plan.guidance.find(
    ({ kind }) => kind === "generic",
  )?.command;
  const nextCommands =
    launchCommands.length > 0
      ? launchCommands
      : fallbackCommand
        ? [fallbackCommand]
        : [];
  if (nextCommands.length > 0) {
    lines.push("", "Next", "");
    for (const command of nextCommands) lines.push(`  ${command}`);
  }

  const backups = projected.providers.flatMap((provider) =>
    provider.backupPath ? [provider.backupPath] : [],
  );
  if (backups.length > 0) {
    lines.push("", backups.length === 1 ? "Backup saved to:" : "Backups saved to:");
    for (const backup of backups) {
      lines.push(`  ${displayHomeRelativePath(backup, plan.homeDirectory)}`);
    }
  }
  return lines.map(sanitizePromptDetail);
}

function setupColorSummary(inspection?: SideGlanceConfigInspection): string {
  if (inspection && !inspection.valid) {
    return "Colors: Status fallback · configuration needs attention";
  }
  const preset = inspection?.config.appearance.preset ?? "status";
  if (preset === "heat") return "Colors: Heat (unchanged)";
  if (preset === "custom") return "Colors: Custom (unchanged)";
  return "Colors: Status (default) · Working cyan · Ready green · Waiting amber · Failed red";
}

function appendGuidanceLines(lines: string[], plan: SetupPlan): void {
  if (plan.guidance.length === 0) return;
  lines.push("Manual and wrapper guidance:");
  for (const guidance of plan.guidance) {
    lines.push(`  ${guidance.message}`, `  ${guidance.command}`);
  }
}

function renderGuidance(plan: SetupPlan, prompter: SetupPrompter): void {
  const lines: string[] = [];
  appendGuidanceLines(lines, plan);
  for (const line of lines) writePromptDetail(prompter, line);
}

function renderProviderSummary(plan: SetupPlan, prompter: SetupPrompter): void {
  const eligible = plan.providers.filter(({ state }) => state === "eligible");
  for (const provider of eligible) {
    writePromptDetail(
      prompter,
      `  ✓ ${providerLabel(provider.provider)} CLI found`,
    );
  }

  const missing = plan.providers.filter(
    (provider) =>
      provider.state !== "eligible" &&
      provider.reason?.code === "binary-not-found",
  );
  if (missing.length > 0) {
    writePromptDetail(
      prompter,
      `  – ${humanList(missing.map(({ provider }) => providerLabel(provider)))} skipped`,
    );
    writePromptDetail(prompter, "    Not found on this Terminal's PATH");
  }

  for (const provider of plan.providers) {
    if (
      provider.state === "eligible" ||
      provider.reason?.code === "binary-not-found"
    ) {
      continue;
    }
    writePromptDetail(
      prompter,
      `  ! ${providerLabel(provider.provider)} skipped${provider.reason ? ` · ${provider.reason.message}` : ""}`,
    );
  }
  prompter.note("");
}

function recommendedChoiceLabel(plan: SetupPlan): string {
  const providers = humanList(plan.selectedProviders.map(providerLabel));
  const notificationProviders = plan.selectedNotifications;
  if (notificationProviders.length === 0) {
    return `Recommended — ${providers} · notifications off`;
  }
  if (
    notificationProviders.length === plan.selectedProviders.length &&
    notificationProviders.every(
      (provider, index) => provider === plan.selectedProviders[index],
    )
  ) {
    return `Recommended — ${providers} with computer notifications`;
  }
  return `Recommended — ${providers} · notifications for ${humanList(notificationProviders.map(providerLabel))}`;
}

async function promptForProviders(
  plan: SetupPlan,
  prompter: SetupPrompter,
  options: SetupCommandOptions,
): Promise<SetupProvider[] | 0 | 130> {
  const selected = await prompter.multiselect(
    "Select provider integrations",
    plan.providers.map((provider) => ({
      id: provider.provider,
      label: providerChoiceLabel(provider),
      selected: provider.selected,
      disabled: provider.state !== "eligible",
    })),
  );
  if (selected.status === "cancelled") return cancellationCode(selected);
  if (options.signal?.aborted) return interruptedSetup(options, false);
  return canonicalPromptProviders(selected.value);
}

async function promptForNotifications(
  plan: SetupPlan,
  selectedProviders: readonly SetupProvider[],
  prompter: SetupPrompter,
  options: SetupCommandOptions,
): Promise<SetupProvider[] | 0 | 130> {
  const providerSet = new Set(selectedProviders);
  const selected = await prompter.multiselect(
    "Select Side Glance computer notifications",
    plan.providers
      .filter(({ provider }) => providerSet.has(provider))
      .map((provider) => ({
        id: provider.provider,
        label: notificationChoiceLabel(provider),
        selected: provider.notifications.defaultSelected,
        disabled: !provider.notifications.selectable,
      })),
  );
  if (selected.status === "cancelled") return cancellationCode(selected);
  if (options.signal?.aborted) return interruptedSetup(options, false);
  return canonicalPromptProviders(selected.value);
}

function providerChoiceLabel(provider: SetupPlan["providers"][number]): string {
  if (provider.state !== "eligible") {
    return `${providerLabel(provider.provider)} — unavailable${provider.reason ? `; ${provider.reason.message}` : ""}`;
  }
  const action = (() => {
    switch (provider.target?.action) {
      case "create":
        return "will create provider settings";
      case "update":
        return "will update provider settings";
      case "unchanged":
        return "settings already match";
      default:
        return "configuration available";
    }
  })();
  return `${providerLabel(provider.provider)} — ${action}${provider.maturity === "experimental" ? "; experimental integration" : ""}`;
}

function renderSoundGuidance(
  dependencies: SetupPlanDependencies,
  prompter: SetupPrompter,
): void {
  if (dependencies.notificationBackend.backend === "osascript") {
    prompter.note(
      "macOS uses the installed sound name Glass by default; Focus or notification settings may still suppress delivery.",
    );
  } else if (dependencies.notificationBackend.backend === "notify-send") {
    prompter.note("Linux notification sound is best-effort.");
  }
  prompter.note(
    "Setup does not send a live notification; run the documented delivery test separately.",
  );
}

function interactiveSoundIsValid(
  sound: string,
  initialRequest: SetupRequest,
  providers: readonly SetupProvider[],
  notifications: readonly SetupProvider[],
  dependencies: SetupPlanDependencies,
): boolean {
  try {
    createSetupPlan(
      {
        ...initialRequest,
        providers,
        notifications,
        notificationsSpecified: true,
        notificationSound: sound,
      },
      dependencies,
    );
    return true;
  } catch {
    return false;
  }
}

function writePromptDetail(prompter: SetupPrompter, message: string): void {
  if (prompter.detail) prompter.detail(message);
  else prompter.note(message);
}

function providerLabel(provider: SetupProvider): string {
  const labels: Readonly<Record<SetupProvider, string>> = {
    claude: "Claude",
    codex: "Codex",
    gemini: "Gemini",
    opencode: "OpenCode",
  };
  return labels[provider];
}

function humanList(values: readonly string[]): string {
  if (values.length === 0) return "none";
  if (values.length === 1) return values[0] as string;
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function displayHomeRelativePath(
  candidate: string,
  homeDirectory: string,
): string {
  if (candidate === homeDirectory) return "~";
  const prefix = homeDirectory.endsWith("/")
    ? homeDirectory
    : `${homeDirectory}/`;
  return candidate.startsWith(prefix)
    ? `~/${candidate.slice(prefix.length)}`
    : candidate;
}

function interactiveWarningMessage(
  code: SetupPlan["providers"][number]["warnings"][number]["code"],
): string {
  const messages: Readonly<Record<typeof code, string>> = {
    "codex-effective-default":
      "Codex native alerts are on while the terminal is unfocused.",
    "codex-custom-notify":
      "Codex has a custom notify command that may also send alerts.",
    "gemini-higher-precedence":
      "Gemini project settings may override this user setting.",
    "opencode-v1-command-unverified":
      "OpenCode v1 was detected without a live version check.",
    "duplicate-native-notifications":
      "Side Glance may produce duplicate alerts.",
    "native-notification-status-unknown":
      "Native alert status is unknown; Side Glance alerts stay off.",
    "side-glance-notifications-unavailable":
      "Computer notifications are temporarily unavailable.",
    "side-glance-notifications-unsupported":
      "Computer notifications are unsupported on this platform.",
  };
  return messages[code];
}

function notificationChoiceLabel(
  provider: SetupPlan["providers"][number],
): string {
  const label = providerLabel(provider.provider);
  const coverage = compactNotificationCoverage(provider.notifications.coverage);
  return (() => {
    switch (provider.notifications.recommendation) {
      case "enable-side-glance":
        return `${label} — on; ${coverage}`;
      case "prefer-native":
        return `${label} — off; native ${coverage}; no duplicates`;
      case "leave-off-unverified":
        return `${label} — off; native alert coverage unverified`;
      case "backend-unavailable":
        return `${label} — off; computer alerts unavailable`;
      case "unsupported":
        return `${label} — computer alerts unsupported`;
    }
  })();
}

function compactNotificationCoverage(
  coverage: SetupPlan["providers"][number]["notifications"]["coverage"],
): string {
  const covered = [
    ...(coverage.attention === "covered" ? ["attention"] : []),
    ...(coverage.failure === "covered" ? ["failure"] : []),
    ...(coverage.ready === "pre-final-silent" ? [] : ["Ready"]),
  ];
  const alerts = covered.length > 0 ? `${covered.join("/")} alerts` : "no alerts";
  return coverage.ready === "pre-final-silent"
    ? `${alerts}; Ready stays silent`
    : alerts;
}

function notificationRecommendationDescription(
  provider: SetupPlan["providers"][number],
): string {
  switch (provider.notifications.recommendation) {
    case "enable-side-glance":
      return "Side Glance defaults on because native delivery is disabled or not configured";
    case "prefer-native":
      return "Side Glance defaults off to avoid duplicate alerts from ready native notifications";
    case "leave-off-unverified":
      return "Side Glance defaults off because native notification readiness is unknown";
    case "backend-unavailable":
      return "Side Glance notifications are unavailable and default off";
    case "unsupported":
      return "Side Glance notifications are unsupported and cannot be selected";
  }
}

function coverageDescription(
  provider: SetupPlan["providers"][number],
): string {
  return coverageDescriptionFromCoverage(provider.notifications.coverage);
}

function coverageDescriptionFromCoverage(
  coverage: SetupPlan["providers"][number]["notifications"]["coverage"],
): string {
  return [
    coverage.ready === "pre-final-silent"
      ? "pre-final Ready stays silent"
      : "Ready covered",
    coverage.attention === "covered" ? "attention covered" : "attention not covered",
    coverage.failure === "covered" ? "failure covered" : "failure not covered",
  ].join("; ");
}

function cancellationCode(outcome: PromptOutcome<unknown>): 0 | 130 {
  return outcome.status === "cancelled" && outcome.reason === "signal" ? 130 : 0;
}

function interruptedSetup(
  options: SetupCommandOptions,
  json: boolean,
): 130 {
  writeSetupFailure(options, json, "interrupted");
  return 130;
}

function canonicalPromptProviders(providers: readonly string[]): SetupProvider[] {
  const selected = new Set(providers);
  return SETUP_PROVIDERS.filter((provider) => selected.has(provider));
}

function writeSetupFailure(
  options: SetupCommandOptions,
  json: boolean,
  code: string,
): number {
  if (json) {
    options.writeStdout(
      `${JSON.stringify({ schemaVersion: 1, kind: "setup-error", code })}\n`,
    );
  } else {
    const message =
      code === "invalid-options"
        ? "Setup options are incomplete or invalid. Use --dry-run, or use --yes with both --providers and --notifications."
        : code === "interrupted"
          ? "Setup was interrupted. No unconfirmed provider changes were written; caught in-progress changes were rolled back when safe."
        : code === "planning-failed"
          ? "Setup could not create a safe provider plan. Run side-glance doctor --json for redacted diagnostics."
          : "Setup could not apply the approved plan; completed provider writes were rolled back when safe.";
    options.writeStderr(`side-glance: ${message}\n`);
  }
  return 1;
}
