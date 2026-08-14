import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

import { adaptAiderNotification } from "../adapters/aider.ts";
import { adaptClaudeHook } from "../adapters/claude.ts";
import { adaptCodexHook } from "../adapters/codex.ts";
import { adaptGeminiHook } from "../adapters/gemini.ts";
import { adaptOpenCodeEvent } from "../adapters/opencode.ts";
import { inspectProviderHooks } from "../adapters/installers.ts";
import type { AdapterContext, AdapterResult } from "../adapters/types.ts";
import { SideGlanceController } from "../core/controller.ts";
import { urgencyFromElapsed } from "../core/policy.ts";
import { sessionKey, type SideGlancePhase } from "../core/protocol.ts";
import { FileSideGlanceStore } from "../core/store.ts";
import { discoverTerminalTarget } from "../core/target.ts";
import { parseSideGlanceEvent, parseSideGlanceSource } from "../core/validation.ts";
import { runInstallCommand } from "./install.ts";
import { runSupervised } from "./run.ts";
import { SIDE_GLANCE_VERSION } from "../version.ts";

const MAX_STDIN_BYTES = 1_048_576;

export async function main(args = process.argv.slice(2)): Promise<number> {
  const { stateDirectory, legacyStateDirectory } = resolveStateDirectories();
  const store = new FileSideGlanceStore({
    directory: stateDirectory,
    ...(legacyStateDirectory ? { legacyDirectory: legacyStateDirectory } : {}),
  });
  const command = args[0];

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
      requireExactArgs(args.slice(1), ["--json"], "event");
      const event = parseSideGlanceEvent(JSON.parse(await readBoundedStdin()));
      writeJson(await new SideGlanceController(store).submit(event));
      return 0;
    }
    case "hook": {
      const provider = parseOption(args, "--provider");
      const target = await discoverTerminalTarget({
        environment: process.env,
        surfaceId: optionalOption(args, "--surface"),
      });
      requireOnlyOptions(
        args.slice(1),
        ["--provider", "--surface", "--session", "--json"],
        "hook",
      );
      const sessionIndex = args.indexOf("--session");
      const fallbackSessionId =
        sessionIndex === -1
          ? process.env.SIDE_GLANCE_SESSION_ID ?? process.env.SIGNAL_SESSION_ID
          : args[sessionIndex + 1];
      const context: AdapterContext = {
        eventId: randomUUID(),
        occurredAt: Date.now(),
        target,
        ...(fallbackSessionId ? { fallbackSessionId } : {}),
      };
      const rawPayload: unknown = JSON.parse(await readBoundedStdin());
      const event = adaptProviderHook(provider, rawPayload, context);
      if (!event) {
        writeJson({ accepted: false });
        return 0;
      }
      writeJson(await new SideGlanceController(store).submit(event));
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
          await inspectProviderHooks({ provider, homeDirectory }),
        ] as const),
      );
      writeJson({
        stateDirectory,
        node: { version: process.versions.node, supported: majorVersion >= 22 },
        terminal: {
          tty: Boolean(process.stdout.isTTY),
          tmux: Boolean(process.env.TMUX),
        },
        providers: Object.fromEntries(inspections),
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
      const thermal = urgencyFromElapsed(elapsed, 120);
      writeJson({ phase, urgency: thermal.urgency, wash: thermal.wash, accent: thermal.accent });
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
        writeJson(current);
        return 0;
      }
      const source = parseSideGlanceSource(parseOption(args, "--source"));
      const sessionId = parseOption(args, "--session");
      requireOnlyOptions(args.slice(1), ["--source", "--session", "--json"], "reset");
      const current = await store.read();
      const session = current.sessions[sessionKey(source, sessionId)];
      if (!session) throw new Error("reset session was not found.");
      const reset = await new SideGlanceController(store).submit({
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
      writeJson(reset);
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
        "usage: side-glance <event|hook|status|doctor|preview|reset|run|install|uninstall> [options]",
      );
  }
}

function helpText(): string {
  return `Side Glance ${SIDE_GLANCE_VERSION}

Usage:
  side-glance doctor --json
  side-glance preview --phase <phase> --elapsed <seconds> --json
  side-glance run [--surface <id>] -- <command> [args...]
  side-glance install <claude|codex|gemini> --json
  side-glance uninstall <claude|codex|gemini> --json
  side-glance status --json
  side-glance reset (--all | --source <source> --session <id>) --json
  side-glance event --json
  side-glance hook --provider <provider> --json

Options:
  -h, --help      Show this help
  -v, --version   Show the installed version
`;
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
): void {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!allowed.includes(argument)) {
      throw new Error(`${command} received an unknown option: ${argument}.`);
    }
    if (argument !== "--json") index += 1;
  }
  if (!args.includes("--json")) throw new Error(`${command} requires --json.`);
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
    case "aider":
      return adaptAiderNotification(payload, context);
    default:
      throw new Error(`Unsupported hook provider: ${provider}.`);
  }
}
