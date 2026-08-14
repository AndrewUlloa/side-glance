import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import { SideGlanceController } from "../core/controller.ts";
import type { SideGlanceTarget } from "../core/protocol.ts";
import { FileSideGlanceStore } from "../core/store.ts";
import { discoverTerminalTarget } from "../core/target.ts";

export interface SupervisedRunResult {
  exitCode: number;
  signal: NodeJS.Signals | null;
}

export async function runSupervised(
  args: readonly string[],
  stateDirectory: string,
  legacyStateDirectory?: string,
): Promise<SupervisedRunResult> {
  const separatorIndex = args.indexOf("--");
  if (separatorIndex === -1 || separatorIndex === args.length - 1) {
    throw new Error("run requires a command after --.");
  }

  const wrapperArgs = args.slice(0, separatorIndex);
  const childArgs = args.slice(separatorIndex + 1);
  const target = await discoverTerminalTarget({
    environment: process.env,
    ...parseTargetOptions(wrapperArgs),
  });
  const { surfaceId } = target;

  const sessionId = `wrapper-${process.pid}-${randomUUID()}`;
  const controller = new SideGlanceController(
    new FileSideGlanceStore({
      directory: stateDirectory,
      ...(legacyStateDirectory ? { legacyDirectory: legacyStateDirectory } : {}),
    }),
  );
  await controller.submit({
    v: 1,
    eventId: randomUUID(),
    source: "generic",
    sessionId,
    kind: "session.started",
    occurredAt: Date.now(),
    generation: 0,
    confidence: "wrapper",
    target,
  });

  let result: SupervisedRunResult;
  try {
    result = await superviseChild(childArgs[0], childArgs.slice(1), {
      SIDE_GLANCE_SURFACE_ID: surfaceId,
      SIDE_GLANCE_SESSION_ID: sessionId,
      ...(target.tty ? { SIDE_GLANCE_TTY: target.tty } : {}),
      ...(target.tmuxPane ? { SIDE_GLANCE_TMUX_PANE: target.tmuxPane } : {}),
    });
  } catch (error) {
    await submitEnd(controller, sessionId, target, "spawn-failed");
    throw error;
  }

  await submitEnd(
    controller,
    sessionId,
    target,
    result.signal ? `signal:${result.signal}` : `exit:${result.exitCode}`,
  );
  return result;
}

async function superviseChild(
  executable: string,
  args: readonly string[],
  sideGlanceEnvironment: Record<string, string>,
): Promise<SupervisedRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      stdio: "inherit",
      env: { ...process.env, ...sideGlanceEnvironment },
    });
    const forwardedSignals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
    const handlers = new Map<NodeJS.Signals, () => void>();
    for (const signal of forwardedSignals) {
      const handler = () => {
        if (!child.killed) child.kill(signal);
      };
      handlers.set(signal, handler);
      process.on(signal, handler);
    }
    const cleanup = () => {
      for (const [signal, handler] of handlers) {
        process.off(signal, handler);
      }
    };

    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("close", (code, signal) => {
      cleanup();
      resolve({
        exitCode: code ?? signalExitCode(signal),
        signal,
      });
    });
  });
}

async function submitEnd(
  controller: SideGlanceController,
  sessionId: string,
  target: SideGlanceTarget,
  reason: string,
): Promise<void> {
  await controller.submit({
    v: 1,
    eventId: randomUUID(),
    source: "generic",
    sessionId,
    kind: "session.ended",
    occurredAt: Date.now(),
    generation: 0,
    reason,
    confidence: "wrapper",
    target,
  });
}

function parseTargetOptions(args: readonly string[]): {
  surfaceId?: string;
  tty?: string;
  tmuxPane?: string;
} {
  const values: { surfaceId?: string; tty?: string; tmuxPane?: string } = {};
  const names = {
    "--surface": "surfaceId",
    "--tty": "tty",
    "--tmux-pane": "tmuxPane",
  } as const;
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const key = names[name as keyof typeof names];
    const value = args[index + 1];
    if (!key || !value || value.startsWith("--")) {
      throw new Error(`run received an invalid target option: ${name ?? "missing"}.`);
    }
    if (values[key] !== undefined) {
      throw new Error(`run received duplicate target option: ${name}.`);
    }
    values[key] = value;
  }
  return values;
}

function signalExitCode(signal: NodeJS.Signals | null): number {
  const numbers: Partial<Record<NodeJS.Signals, number>> = {
    SIGHUP: 1,
    SIGINT: 2,
    SIGQUIT: 3,
    SIGKILL: 9,
    SIGTERM: 15,
  };
  return signal ? 128 + (numbers[signal] ?? 1) : 1;
}
