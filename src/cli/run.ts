import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import { SignalController } from "../core/controller.ts";
import { FileSignalStore } from "../core/store.ts";

export interface SupervisedRunResult {
  exitCode: number;
  signal: NodeJS.Signals | null;
}

export async function runSupervised(
  args: readonly string[],
  stateDirectory: string,
): Promise<SupervisedRunResult> {
  const separatorIndex = args.indexOf("--");
  if (separatorIndex === -1 || separatorIndex === args.length - 1) {
    throw new Error("run requires a command after --.");
  }

  const wrapperArgs = args.slice(0, separatorIndex);
  const childArgs = args.slice(separatorIndex + 1);
  const surfaceIndex = wrapperArgs.indexOf("--surface");
  if (surfaceIndex === -1 || !wrapperArgs[surfaceIndex + 1]) {
    throw new Error("run requires --surface before --.");
  }
  if (wrapperArgs.length !== 2 || surfaceIndex !== 0) {
    throw new Error("run received an unknown option.");
  }
  const surfaceId = validateSurfaceId(wrapperArgs[1]);

  const sessionId = `wrapper-${process.pid}-${randomUUID()}`;
  const controller = new SignalController(new FileSignalStore({ directory: stateDirectory }));
  await controller.submit({
    v: 1,
    eventId: randomUUID(),
    source: "generic",
    sessionId,
    kind: "session.started",
    occurredAt: Date.now(),
    generation: 0,
    confidence: "wrapper",
    target: { surfaceId },
  });

  let result: SupervisedRunResult;
  try {
    result = await superviseChild(childArgs[0], childArgs.slice(1));
  } catch (error) {
    await submitEnd(controller, sessionId, surfaceId, "spawn-failed");
    throw error;
  }

  await submitEnd(
    controller,
    sessionId,
    surfaceId,
    result.signal ? `signal:${result.signal}` : `exit:${result.exitCode}`,
  );
  return result;
}

async function superviseChild(
  executable: string,
  args: readonly string[],
): Promise<SupervisedRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], { stdio: "inherit" });
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
  controller: SignalController,
  sessionId: string,
  surfaceId: string,
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
    target: { surfaceId },
  });
}

function validateSurfaceId(value: string): string {
  if (value.length === 0 || value.length > 512) {
    throw new Error("run surface ID must contain 1 to 512 characters.");
  }
  if ([...value].some((character) => (character.codePointAt(0) ?? 0) <= 0x1f)) {
    throw new Error("run surface ID may not contain control characters.");
  }
  return value;
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
