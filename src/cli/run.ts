import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import { SideGlanceController } from "../core/controller.ts";
import type { SideGlanceTarget } from "../core/protocol.ts";
import { FileSideGlanceStore } from "../core/store.ts";
import { discoverTerminalTarget } from "../core/target.ts";
import { createNativeNotifier } from "../notifications/native.ts";
import {
  sanitizeNotificationLabel,
  sanitizeNotificationSound,
  type EventNotifier,
} from "../notifications/policy.ts";

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
  const wrapperOptions = parseWrapperOptions(wrapperArgs);
  const target = await discoverTerminalTarget({
    environment: process.env,
    ...wrapperOptions.target,
  });
  const { surfaceId } = target;

  const sessionId = `wrapper-${process.pid}-${randomUUID()}`;
  const store = new FileSideGlanceStore({
    directory: stateDirectory,
    ...(legacyStateDirectory ? { legacyDirectory: legacyStateDirectory } : {}),
  });
  const controller = new SideGlanceController(store);
  const notifier = configuredExitNotifier(wrapperOptions);
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
      ...(wrapperOptions.label
        ? { SIDE_GLANCE_LABEL: wrapperOptions.label }
        : {}),
      ...(wrapperOptions.notificationSound
        ? { SIDE_GLANCE_NOTIFICATION_SOUND: wrapperOptions.notificationSound }
        : {}),
    });
  } catch (error) {
    await notifyExit(notifier, sessionId, target, "turn.failed", "spawn-failed");
    await submitEnd(controller, sessionId, target, "spawn-failed");
    await submitInheritedEnds(controller, store, sessionId, "spawn-failed");
    throw error;
  }

  await notifyExit(
    notifier,
    sessionId,
    target,
    result.signal
      ? "turn.cancelled"
      : result.exitCode === 0
        ? "turn.completed"
        : "turn.failed",
    result.signal ? `signal:${result.signal}` : `exit:${result.exitCode}`,
  );
  await submitEnd(
    controller,
    sessionId,
    target,
    result.signal ? `signal:${result.signal}` : `exit:${result.exitCode}`,
  );
  await submitInheritedEnds(
    controller,
    store,
    sessionId,
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

async function submitInheritedEnds(
  controller: SideGlanceController,
  store: FileSideGlanceStore,
  sessionId: string,
  reason: string,
): Promise<void> {
  const state = await store.read();
  for (const session of Object.values(state.sessions)) {
    if (
      session.source === "generic" ||
      session.wrapperSessionId !== sessionId ||
      session.phase === "inactive"
    ) {
      continue;
    }
    await controller.submit({
      v: 1,
      eventId: randomUUID(),
      source: session.source,
      sessionId: session.sessionId,
      kind: "session.ended",
      occurredAt: Math.max(Date.now(), session.updatedAt + 1),
      generation: session.generation,
      reason,
      confidence: "wrapper",
      ...(session.target ? { target: session.target } : {}),
    });
  }
}

interface WrapperOptions {
  target: {
    surfaceId?: string;
    tty?: string;
    tmuxPane?: string;
  };
  notifyOnExit: boolean;
  notificationSound?: string;
  label?: string;
}

function parseWrapperOptions(args: readonly string[]): WrapperOptions {
  const values: WrapperOptions = { target: {}, notifyOnExit: false };
  const targetNames = {
    "--surface": "surfaceId",
    "--tty": "tty",
    "--tmux-pane": "tmuxPane",
  } as const;
  const valueNames = {
    ...targetNames,
    "--notification-sound": "notificationSound",
    "--label": "label",
  } as const;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === "--notify-on-exit") {
      if (seen.has(name)) {
        throw new Error(`run received duplicate option: ${name}.`);
      }
      seen.add(name);
      values.notifyOnExit = true;
      continue;
    }
    const key = valueNames[name as keyof typeof valueNames];
    const value = args[index + 1];
    if (!key || !value || value.startsWith("--")) {
      throw new Error(`run received an invalid option: ${name ?? "missing"}.`);
    }
    if (seen.has(name)) {
      throw new Error(`run received duplicate option: ${name}.`);
    }
    seen.add(name);
    if (name in targetNames) {
      values.target[key as keyof typeof values.target] = value;
    } else if (key === "notificationSound") {
      values.notificationSound = sanitizeRequiredOption(
        value,
        "notification sound",
        sanitizeNotificationSound,
      );
    } else if (key === "label") {
      values.label = sanitizeRequiredOption(
        value,
        "notification label",
        sanitizeNotificationLabel,
      );
    }
    index += 1;
  }
  return values;
}

function sanitizeRequiredOption(
  value: string,
  name: string,
  sanitize: (input: string) => string,
): string {
  const sanitized = sanitize(value);
  if (!sanitized) throw new Error(`${name} must contain visible text.`);
  return sanitized;
}

function configuredExitNotifier(options: WrapperOptions): EventNotifier | undefined {
  if (
    !options.notifyOnExit ||
    process.env.SIDE_GLANCE_NOTIFICATION_BACKEND === "none"
  ) {
    return undefined;
  }
  return createNativeNotifier({
    ...(options.notificationSound ? { sound: options.notificationSound } : {}),
    ...(options.label ? { label: options.label } : {}),
  });
}

async function notifyExit(
  notifier: EventNotifier | undefined,
  sessionId: string,
  target: SideGlanceTarget,
  kind: "turn.completed" | "turn.failed" | "turn.cancelled",
  reason: string,
): Promise<void> {
  if (!notifier) return;
  await notifier.notify({
    v: 1,
    eventId: randomUUID(),
    source: "generic",
    sessionId,
    kind,
    occurredAt: Date.now(),
    generation: 0,
    reason,
    confidence: "wrapper",
    target,
  });
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
