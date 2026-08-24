import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path, { delimiter } from "node:path";

import {
  installProviderHooks,
  uninstallProviderHooks,
  type InstallableProvider,
} from "../adapters/installers.ts";
import {
  installOpenCodePlugin,
  uninstallOpenCodePlugin,
} from "../adapters/opencode-installer.ts";
import { inspectNotificationReadiness } from "../notifications/inspection.ts";

type CliInstallableProvider = InstallableProvider | "opencode";

export async function runInstallCommand(
  args: readonly string[],
  action: "install" | "uninstall",
): Promise<number> {
  if (action === "install" && isEphemeralNpmExecution(process.env, process.argv[1])) {
    throw new Error(
      "Permanent provider hooks cannot be installed from npx/npm exec. Install Side Glance from a standalone release or with `npm install --global side-glance`, then run `side-glance install` again.",
    );
  }
  const provider = parseProvider(args[0]);
  const homeDirectory = option(args, "--home") ?? homedir();
  const executablePath =
    option(args, "--executable") ?? path.resolve(process.argv[1] ?? "side-glance");
  validateArguments(args.slice(1), action);
  const notifications = args.includes("--notifications");
  const notificationSound = option(args, "--notification-sound");
  if (notificationSound !== undefined && !notifications) {
    throw new Error("--notification-sound requires --notifications.");
  }
  if (provider === "opencode" && action === "install") {
    await requireStableOpenCodeV1(process.env);
  }

  const result =
    provider === "opencode"
      ? await (action === "install"
          ? installOpenCodePlugin({
              homeDirectory,
              executablePath,
              ...(notifications ? { notifications: true } : {}),
              ...(notificationSound ? { notificationSound } : {}),
            })
          : uninstallOpenCodePlugin({ homeDirectory, executablePath }))
      : await (action === "install"
          ? installProviderHooks({
              provider,
              homeDirectory,
              executablePath,
              ...(notifications ? { notifications: true } : {}),
              ...(notificationSound !== undefined
                ? { notificationSound }
                : {}),
            })
          : uninstallProviderHooks({ provider, homeDirectory, executablePath }));
  const warnings =
    action === "install" && notifications
      ? await duplicateNotificationWarnings(provider, homeDirectory)
      : [];
  process.stdout.write(
    `${JSON.stringify({ ...result, ...(warnings.length > 0 ? { warnings } : {}) })}\n`,
  );
  return 0;
}

async function requireStableOpenCodeV1(
  environment: Readonly<Record<string, string | undefined>>,
): Promise<void> {
  if (environment.OPENCODE_CONFIG || environment.OPENCODE_CONFIG_DIR) {
    throw new Error(
      "OpenCode configuration overrides are active. Side Glance only installs into the stable v1 global plugin directory; clear OPENCODE_CONFIG and OPENCODE_CONFIG_DIR for installation, then verify the effective configuration with `side-glance doctor --json`.",
    );
  }
  const [v1, v2] = await Promise.all([
    executableOnPath("opencode", environment),
    executableOnPath("opencode2", environment),
  ]);
  if (v1) return;
  if (v2) {
    throw new Error(
      "OpenCode 2 beta uses an incompatible v2 plugin API. Side Glance currently supports the stable OpenCode v1 `opencode` binary only; keep v1 installed or wait for explicit v2 support.",
    );
  }
  throw new Error(
    "OpenCode stable v1 was not found on PATH, so its plugin API cannot be verified. Install the `opencode` binary before running this command.",
  );
}

async function executableOnPath(
  command: string,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<boolean> {
  for (const directory of (environment.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    try {
      await access(path.join(directory, command), constants.X_OK);
      return true;
    } catch {
      // Continue through PATH without executing an untrusted provider binary.
    }
  }
  return false;
}

async function duplicateNotificationWarnings(
  provider: CliInstallableProvider,
  homeDirectory: string,
): Promise<string[]> {
  if (provider === "claude") return [];
  const readiness = await inspectNotificationReadiness({
    homeDirectory,
    platform: process.platform,
    pathProbe: async () => false,
  });
  const native = readiness.providers[provider];
  const warnings: string[] = [];
  if (native.status === "ready") {
    warnings.push(
      provider === "codex" && readiness.providers.codex.effectiveDefault
        ? "Codex native notifications are enabled by default when the terminal is unfocused; enabling Side Glance notifications may produce duplicate alerts."
        : `${provider} native notifications are already configured; enabling Side Glance notifications may produce duplicate alerts.`,
    );
  }
  if (
    provider === "codex" &&
    readiness.providers.codex.topLevelNotify === true
  ) {
    warnings.push(
      "Codex has a top-level notify command configured; inspect that command before enabling Side Glance notifications because it may already deliver alerts.",
    );
  }
  return warnings;
}

function isEphemeralNpmExecution(
  environment: Readonly<Record<string, string | undefined>>,
  invokedPath: string | undefined,
): boolean {
  return (
    environment.npm_lifecycle_event === "npx" ||
    environment.npm_command === "exec" ||
    /(?:^|[/\\])_npx(?:[/\\]|$)/u.test(invokedPath ?? "")
  );
}

function parseProvider(value: string | undefined): CliInstallableProvider {
  if (value === "claude" || value === "codex" || value === "gemini") {
    return value;
  }
  if (value === "opencode") return value;
  throw new Error("provider must be claude, codex, gemini, or opencode.");
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function validateArguments(args: readonly string[], action: string): void {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") continue;
    if (argument === "--notifications" && action === "install") continue;
    if (
      argument === "--home" ||
      argument === "--executable" ||
      (argument === "--notification-sound" && action === "install")
    ) {
      index += 1;
      continue;
    }
    throw new Error(`${action} received an unknown option: ${argument}.`);
  }
  if (!args.includes("--json")) throw new Error(`${action} requires --json.`);
}
