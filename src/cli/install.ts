import { homedir } from "node:os";
import path from "node:path";

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
  if (provider === "opencode" && action === "install" && !notifications) {
    throw new Error("OpenCode installation requires explicit --notifications opt-in.");
  }

  const result =
    provider === "opencode"
      ? await (action === "install"
          ? installOpenCodePlugin({
              homeDirectory,
              executablePath,
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
  if (native.status === "ready") {
    return [
      `${provider} native notifications are already configured; enabling Side Glance notifications may produce duplicate alerts.`,
    ];
  }
  if (
    provider === "codex" &&
    readiness.providers.codex.topLevelNotify === true
  ) {
    return [
      "Codex has a top-level notify command configured; inspect that command before enabling Side Glance notifications because it may already deliver alerts.",
    ];
  }
  return [];
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
