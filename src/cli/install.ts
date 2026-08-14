import { homedir } from "node:os";
import path from "node:path";

import {
  installProviderHooks,
  uninstallProviderHooks,
  type InstallableProvider,
} from "../adapters/installers.ts";

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

  const operation = action === "install" ? installProviderHooks : uninstallProviderHooks;
  const result = await operation({ provider, homeDirectory, executablePath });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return 0;
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

function parseProvider(value: string | undefined): InstallableProvider {
  if (value === "claude" || value === "codex" || value === "gemini") {
    return value;
  }
  throw new Error("provider must be claude, codex, or gemini.");
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
    if (argument === "--home" || argument === "--executable") {
      index += 1;
      continue;
    }
    throw new Error(`${action} received an unknown option: ${argument}.`);
  }
  if (!args.includes("--json")) throw new Error(`${action} requires --json.`);
}
