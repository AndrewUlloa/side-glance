import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path, { delimiter } from "node:path";

import { adaptClaudeHook } from "../adapters/claude.ts";
import { adaptCodexHook } from "../adapters/codex.ts";
import { adaptGeminiHook } from "../adapters/gemini.ts";
import { adaptOpenCodeEvent } from "../adapters/opencode.ts";
import { inspectProviderHooks } from "../adapters/installers.ts";
import type { AdapterContext, AdapterResult } from "../adapters/types.ts";
import { SideGlanceController } from "../core/controller.ts";
import { visualForPhase } from "../core/visual.ts";
import { sessionKey, type SideGlancePhase } from "../core/protocol.ts";
import { FileSideGlanceStore } from "../core/store.ts";
import {
  discoverOptionalTerminalTarget,
  discoverTerminalTarget,
} from "../core/target.ts";
import { parseSideGlanceEvent, parseSideGlanceSource } from "../core/validation.ts";
import { createNativeNotifier } from "../notifications/native.ts";
import { inspectNotificationReadiness } from "../notifications/inspection.ts";
import type {
  EventNotifier,
  NotificationOptions,
} from "../notifications/policy.ts";
import { createDefaultSurfaceRenderer } from "../renderers/surface.ts";
import { SIDE_GLANCE_VERSION } from "../version.ts";
import {
  detectBootstrapTarget,
  resolvePackageManagerOnPath,
} from "./bootstrap.ts";
import {
  bootstrapInitHelpText,
  runBootstrapChildCommand,
  runBootstrapInit,
} from "./bootstrap-command.ts";
import {
  captureExecutableIdentity,
  detectEphemeralNpmExecution,
  findDurableExecutableOnPath,
  revalidateExecutableIdentity,
  resolveExecutableInvocationPath,
} from "./executable.ts";
import {
  inspectProviderCapabilities,
  inspectTerminalCapabilities,
} from "./doctor.ts";
import { runInstallCommand } from "./install.ts";
import { runSupervised } from "./run.ts";
import { runSetupCommand } from "./setup-command.ts";
import { createDurableSetupDiscovery } from "./setup-discovery.ts";

const MAX_STDIN_BYTES = 1_048_576;

export async function main(args = process.argv.slice(2)): Promise<number> {
  const command = args[0];
  if (command === "init" || command === "setup") {
    return runGuidedSetupCommand(command, args.slice(1));
  }
  const { stateDirectory, legacyStateDirectory } = resolveStateDirectories();
  const store = new FileSideGlanceStore({
    directory: stateDirectory,
    ...(legacyStateDirectory ? { legacyDirectory: legacyStateDirectory } : {}),
  });
  switch (command) {
    case "--version":
    case "-v":
      process.stdout.write(`${SIDE_GLANCE_VERSION}\n`);
      return 0;
    case "--help":
    case "-h":
      process.stdout.write(helpText());
      return 0;
    case "event": {
      requireOnlyOptions(
        args.slice(1),
        [
          "--notifications",
          "--notification-sound",
          "--label",
          "--terminal-title",
          "--json",
        ],
        "event",
        ["--notifications", "--terminal-title", "--json"],
      );
      const event = parseSideGlanceEvent(JSON.parse(await readBoundedStdin()));
      await controllerWithNotifications(store, args).submit(event);
      writeJson({});
      return 0;
    }
    case "hook": {
      const provider = parseOption(args, "--provider");
      const notifications = args.includes("--notifications");
      const target = await (notifications
        ? discoverOptionalTerminalTarget({
            environment: process.env,
            surfaceId: optionalOption(args, "--surface"),
          })
        : discoverTerminalTarget({
            environment: process.env,
            surfaceId: optionalOption(args, "--surface"),
          }));
      requireOnlyOptions(
        args.slice(1),
        [
          "--provider",
          "--surface",
          "--session",
          "--notifications",
          "--notification-sound",
          "--label",
          "--terminal-title",
          "--json",
        ],
        "hook",
        ["--notifications", "--terminal-title", "--json"],
      );
      const sessionIndex = args.indexOf("--session");
      const fallbackSessionId =
        sessionIndex === -1
          ? process.env.SIDE_GLANCE_SESSION_ID ?? process.env.SIGNAL_SESSION_ID
          : args[sessionIndex + 1];
      const wrapperSessionId =
        process.env.SIDE_GLANCE_SESSION_ID ?? process.env.SIGNAL_SESSION_ID;
      const context: AdapterContext = {
        eventId: randomUUID(),
        occurredAt: Date.now(),
        ...(target ? { target } : {}),
        ...(fallbackSessionId ? { fallbackSessionId } : {}),
        ...(wrapperSessionId ? { wrapperSessionId } : {}),
      };
      const rawPayload: unknown = JSON.parse(await readBoundedStdin());
      const event = adaptProviderHook(provider, rawPayload, context);
      if (!event) {
        writeHookAcknowledgement(provider);
        return 0;
      }
      await controllerWithNotifications(store, args).submit(event);
      writeHookAcknowledgement(provider);
      return 0;
    }
    case "notify": {
      const source = parseSideGlanceSource(parseOption(args, "--source"));
      const wrapperSessionId =
        process.env.SIDE_GLANCE_SESSION_ID ?? process.env.SIGNAL_SESSION_ID;
      const sessionId = optionalOption(args, "--session") ?? wrapperSessionId;
      if (!sessionId) {
        throw new Error(
          "notify requires --session or a wrapper-provided SIDE_GLANCE_SESSION_ID.",
        );
      }
      const kind = parseNotificationKind(parseOption(args, "--kind"));
      const target = await discoverOptionalTerminalTarget({
        environment: process.env,
        surfaceId: optionalOption(args, "--surface"),
      });
      requireOnlyOptions(
        args.slice(1),
        [
          "--source",
          "--kind",
          "--session",
          "--surface",
          "--notification-sound",
          "--label",
          "--terminal-title",
          "--json",
        ],
        "notify",
        ["--terminal-title", "--json"],
      );
      const event = parseSideGlanceEvent({
        v: 1,
        eventId: randomUUID(),
        source,
        sessionId,
        kind,
        occurredAt: Date.now(),
        ...(wrapperSessionId ? { wrapperSessionId } : {}),
        confidence: "notification",
        ...(target ? { target } : {}),
      });
      await controllerWithNotifications(store, args, true).submit(event);
      writeJson({});
      return 0;
    }
    case "install":
    case "uninstall":
      return runInstallCommand(args.slice(1), command);
    case "status": {
      requireExactArgs(args.slice(1), ["--json"], "status");
      writeJson(await store.read());
      return 0;
    }
    case "doctor": {
      const homeDirectory = optionalOption(args, "--home") ?? homedir();
      requireOnlyOptions(args.slice(1), ["--home", "--json"], "doctor");
      const majorVersion = Number.parseInt(process.versions.node.split(".")[0], 10);
      const inspections = await Promise.all(
        (["claude", "codex", "gemini"] as const).map(async (provider) => [
          provider,
          await inspectProviderHooksSafely(provider, homeDirectory),
        ] as const),
      );
      const notificationReadiness = await inspectNotificationReadiness({
        homeDirectory,
        platform: process.platform,
        pathProbe: probeExecutable,
        backendHints: {
          desktopSession: desktopSessionAvailable(),
        },
      });
      const providerInspections = Object.fromEntries(inspections);
      const capabilities = await inspectProviderCapabilities({
        homeDirectory,
        environment: process.env,
        pathProbe: probeExecutable,
        hooks: providerInspections,
        notifications: notificationReadiness,
      });
      writeJson({
        stateDirectory,
        node: { version: process.versions.node, supported: majorVersion >= 22 },
        terminal: {
          tty: Boolean(process.stdout.isTTY),
          tmux: Boolean(process.env.TMUX),
          ...inspectTerminalCapabilities({
            platform: process.platform,
            environment: process.env,
            tmux: Boolean(process.env.TMUX),
          }),
        },
        providers: providerInspections,
        notifications: notificationReadiness,
        capabilities,
      });
      return 0;
    }
    case "preview": {
      const phase = parseOption(args, "--phase") as SideGlancePhase;
      if (!["working", "waiting", "completed", "failed"].includes(phase)) {
        throw new Error("preview phase must be working, waiting, completed, or failed.");
      }
      const elapsed = parseNonNegativeNumber(parseOption(args, "--elapsed"), "elapsed");
      requireOnlyOptions(args.slice(1), ["--phase", "--elapsed", "--json"], "preview");
      const visual = visualForPhase(phase, elapsed, 120);
      writeJson({
        phase,
        urgency: visual.urgency,
        wash: visual.wash,
        accent: visual.accent,
      });
      return 0;
    }
    case "reset": {
      if (args.includes("--all")) {
        requireExactArgs(args.slice(1), ["--all", "--json"], "reset");
        const controller = new SideGlanceController(store);
        let current = await store.read();
        for (const session of Object.values(current.sessions)) {
          if (session.phase === "inactive") continue;
          current = await controller.submit({
            v: 1,
            eventId: randomUUID(),
            source: session.source,
            sessionId: session.sessionId,
            kind: "session.ended",
            occurredAt: Math.max(Date.now(), session.updatedAt + 1),
            generation: session.generation,
            reason: "manual-reset-all",
            confidence: "wrapper",
            ...(session.target ? { target: session.target } : {}),
          });
        }
        writeJson({});
        return 0;
      }
      const source = parseSideGlanceSource(parseOption(args, "--source"));
      const sessionId = parseOption(args, "--session");
      requireOnlyOptions(args.slice(1), ["--source", "--session", "--json"], "reset");
      const current = await store.read();
      const session = current.sessions[sessionKey(source, sessionId)];
      if (!session) throw new Error("reset session was not found.");
      await new SideGlanceController(store).submit({
        v: 1,
        eventId: randomUUID(),
        source,
        sessionId,
        kind: "session.ended",
        occurredAt: Math.max(Date.now(), session.updatedAt + 1),
        generation: session.generation,
        reason: "manual-reset",
        confidence: "wrapper",
        ...(session.target ? { target: session.target } : {}),
      });
      writeJson({});
      return 0;
    }
    case "run": {
      const result = await runSupervised(
        args.slice(1),
        stateDirectory,
        legacyStateDirectory,
      );
      if (result.signal) {
        process.kill(process.pid, result.signal);
      }
      return result.exitCode;
    }
    default:
      throw new Error(
        "usage: side-glance <init|setup|event|hook|notify|status|doctor|preview|reset|run|install|uninstall> [options]",
      );
  }
}

function writeHookAcknowledgement(provider: string): void {
  if (provider === "codex" || provider === "gemini") writeJson({});
}

function helpText(): string {
  return `Side Glance ${SIDE_GLANCE_VERSION}

Usage:
  side-glance init [--dry-run | --yes --providers <list> --notifications <list|none>]
  side-glance setup [--dry-run | --yes --providers <list> --notifications <list|none>]
  side-glance doctor --json
  side-glance preview --phase <phase> --elapsed <seconds> --json
  side-glance run [--surface <id>] [--notify-on-exit] -- <command> [args...]
  side-glance install <claude|codex|gemini|opencode> [--notifications] --json
  side-glance uninstall <claude|codex|gemini|opencode> --json
  side-glance status --json
  side-glance reset (--all | --source <source> --session <id>) --json
  side-glance event --json
  side-glance hook --provider <provider> --json
  side-glance notify --source <source> --kind <completed|waiting|failed|cancelled> --json

Options:
  --notifications              Enable Side Glance desktop notifications
  --notification-sound <name>  Use an installed sound name (default: Glass)
  --label <text>                Distinguish concurrent sessions privately
  --notify-on-exit              Notify when a supervised process exits
  --terminal-title              Opt into a sanitized lifecycle title fallback
  -h, --help                    Show this help
  -v, --version                 Show the installed version
`;
}

async function runGuidedSetupCommand(
  command: "init" | "setup",
  args: readonly string[],
): Promise<number> {
  const reportedInvocationPath = process.argv[1] ?? process.execPath;
  const recoveredInvocationPath = await resolveExecutableInvocationPath({
    reportedInvocationPath,
    processExecutablePath: process.execPath,
    environment: process.env,
  });
  const invocationPath =
    recoveredInvocationPath ?? path.resolve(reportedInvocationPath);
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    if (
      command === "init" &&
      detectEphemeralNpmExecution({
        environment: process.env,
        invocationPath,
      })
    ) {
      process.stdout.write(bootstrapInitHelpText());
      return 0;
    }
    return runSetupCommand(command, args, {
      execution: "durable",
      interactive,
      discover: async () => {
        throw new Error("Setup help does not perform discovery.");
      },
      writeStdout: (value) => process.stdout.write(value),
      writeStderr: (value) => process.stderr.write(value),
    });
  }
  const execution = detectEphemeralNpmExecution({
    environment: process.env,
    invocationPath,
  })
    ? "ephemeral"
    : "durable";
  if (execution === "ephemeral" && command === "init") {
    const currentRunnerIdentity = await captureExecutableIdentity(invocationPath);
    const controller = new AbortController();
    const interrupt = () => controller.abort();
    process.once("SIGINT", interrupt);
    try {
      return await runBootstrapInit(args, {
        exactVersion: SIDE_GLANCE_VERSION,
        invocationPath,
        currentRunnerIdentity,
        environment: process.env,
        target: detectBootstrapTarget(),
        defaultHomeDirectory: homedir(),
        interactive,
        dependencies: {
          findDurableExecutable: findDurableExecutableOnPath,
          resolvePackageManager: resolvePackageManagerOnPath,
          revalidateExecutable: (identity, options) =>
            revalidateExecutableIdentity(identity, options),
          runCommand: runBootstrapChildCommand,
        },
        writeStdout: (value) => process.stdout.write(value),
        writeStderr: (value) => process.stderr.write(value),
        signal: controller.signal,
      });
    } finally {
      process.removeListener("SIGINT", interrupt);
    }
  }
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once("SIGINT", interrupt);
  try {
    return await runSetupCommand(command, args, {
      execution,
      interactive,
      discover: (request) =>
        createDurableSetupDiscovery(request, {
          defaultHomeDirectory: homedir(),
          defaultExecutablePath: recoveredInvocationPath,
          expectedVersion: SIDE_GLANCE_VERSION,
          environment: process.env,
          platform: process.platform,
        }),
      writeStdout: (value) => process.stdout.write(value),
      writeStderr: (value) => process.stderr.write(value),
      signal: controller.signal,
    });
  } finally {
    process.removeListener("SIGINT", interrupt);
  }
}

function resolveStateDirectories(): {
  stateDirectory: string;
  legacyStateDirectory?: string;
} {
  const configured = process.env.SIDE_GLANCE_STATE_DIR;
  if (configured) {
    if (!path.isAbsolute(configured)) {
      throw new Error("SIDE_GLANCE_STATE_DIR must be an absolute path.");
    }
    return { stateDirectory: path.resolve(configured) };
  }
  const legacyConfigured = process.env.SIGNAL_STATE_DIR;
  if (legacyConfigured) {
    if (!path.isAbsolute(legacyConfigured)) {
      throw new Error("Legacy state directory must be an absolute path.");
    }
    const directory = path.resolve(legacyConfigured);
    return { stateDirectory: directory, legacyStateDirectory: directory };
  }
  const base = process.env.XDG_STATE_HOME
    ? path.resolve(process.env.XDG_STATE_HOME)
    : path.join(homedir(), ".local", "state");
  return {
    stateDirectory: path.join(base, "side-glance"),
    legacyStateDirectory: path.join(base, "signal"),
  };
}

async function readBoundedStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_STDIN_BYTES) {
      throw new Error(`event JSON exceeds ${MAX_STDIN_BYTES} bytes.`);
    }
    chunks.push(buffer);
  }
  const input = Buffer.concat(chunks).toString("utf8");
  if (input.trim().length === 0) throw new Error("event JSON is required on stdin.");
  return input;
}

function parseOption(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = args[index + 1];
  if (index === -1 || value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function optionalOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function parseNonNegativeNumber(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }
  return parsed;
}

function requireExactArgs(
  actual: readonly string[],
  expected: readonly string[],
  command: string,
): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${command} expects ${expected.join(" ")}.`);
  }
}

function requireOnlyOptions(
  args: readonly string[],
  allowed: readonly string[],
  command: string,
  booleanOptions: readonly string[] = ["--json"],
): void {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!allowed.includes(argument)) {
      throw new Error(`${command} received an unknown option: ${argument}.`);
    }
    if (!booleanOptions.includes(argument)) index += 1;
  }
  if (!args.includes("--json")) throw new Error(`${command} requires --json.`);
}

async function inspectProviderHooksSafely(
  provider: "claude" | "codex" | "gemini",
  homeDirectory: string,
): Promise<unknown> {
  try {
    return await inspectProviderHooks({ provider, homeDirectory });
  } catch (error) {
    return {
      provider,
      valid: false,
      status: "unknown",
      error: error instanceof Error ? error.message : "inspection failed",
    };
  }
}

function parseNotificationKind(value: string):
  | "turn.completed"
  | "attention.waiting"
  | "turn.failed"
  | "turn.cancelled" {
  switch (value) {
    case "completed":
      return "turn.completed";
    case "waiting":
      return "attention.waiting";
    case "failed":
      return "turn.failed";
    case "cancelled":
      return "turn.cancelled";
    default:
      throw new Error("notify kind must be completed, waiting, failed, or cancelled.");
  }
}

function controllerWithNotifications(
  store: FileSideGlanceStore,
  args: readonly string[],
  enabled = args.includes("--notifications"),
): SideGlanceController {
  return new SideGlanceController(
    store,
    createDefaultSurfaceRenderer({
      terminalTitle:
        args.includes("--terminal-title") ||
        process.env.SIDE_GLANCE_TERMINAL_TITLE === "1",
    }),
    configuredNotifier(args, enabled),
  );
}

function configuredNotifier(
  args: readonly string[],
  enabled: boolean,
): EventNotifier | undefined {
  if (!enabled || process.env.SIDE_GLANCE_NOTIFICATION_BACKEND === "none") {
    if (
      !enabled &&
      (args.includes("--notification-sound") || args.includes("--label"))
    ) {
      throw new Error(
        "--notification-sound and --label require --notifications.",
      );
    }
    return undefined;
  }
  return createNativeNotifier(notificationOptionsForInvocation(args));
}

export function notificationOptionsForInvocation(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): NotificationOptions {
  const sound =
    environment.SIDE_GLANCE_NOTIFICATION_SOUND ||
    optionalOption(args, "--notification-sound");
  const label = optionalOption(args, "--label") ?? environment.SIDE_GLANCE_LABEL;
  return {
    ...(sound ? { sound } : {}),
    ...(label ? { label } : {}),
  };
}

async function probeExecutable(candidate: string): Promise<boolean> {
  const paths = path.isAbsolute(candidate)
    ? [candidate]
    : (process.env.PATH ?? "")
        .split(delimiter)
        .filter(Boolean)
        .map((directory) => path.join(directory, candidate));
  for (const executable of paths) {
    try {
      await access(executable, constants.X_OK);
      return true;
    } catch {
      // Keep searching the configured PATH without executing the candidate.
    }
  }
  return false;
}

function desktopSessionAvailable(): boolean {
  if (process.platform === "darwin") return true;
  if (process.platform === "linux") {
    return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  }
  return false;
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function adaptProviderHook(
  provider: string,
  payload: unknown,
  context: AdapterContext,
): AdapterResult {
  switch (provider) {
    case "claude":
      return adaptClaudeHook(payload, context);
    case "codex":
      return adaptCodexHook(payload, context);
    case "gemini":
      return adaptGeminiHook(payload, context);
    case "opencode":
      return adaptOpenCodeEvent(payload, context);
    default:
      throw new Error(`Unsupported hook provider: ${provider}.`);
  }
}
