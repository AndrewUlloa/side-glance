import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { performance } from "node:perf_hooks";
import type { Readable, Stream } from "node:stream";
import { promisify } from "node:util";

import type { SideGlanceTarget } from "./protocol.ts";

const execFileAsync = promisify(execFile);
const PROCESS_ANCESTRY_MAX_DEPTH = 8;
const PROCESS_ANCESTRY_TIMEOUT_MS = 500;
const PROCESS_INSPECTION_MAX_BYTES = 4_096;

interface TtyProcess {
  kill: (signal: NodeJS.Signals) => boolean;
  onClose: (listener: (code: number | null) => void) => void;
  onError: (listener: (error: Error) => void) => void;
  stdout: Readable;
}

interface TtySpawnOptions {
  stdio: [Stream, "pipe", "ignore"];
}

type SpawnTtyProcess = (
  command: string,
  arguments_: string[],
  options: TtySpawnOptions,
) => TtyProcess;

export interface TargetProcessRecord {
  pid: number;
  ppid: number;
  uid: number;
  tty: string;
  startedAt: string;
}

type InspectProcesses = (
  pids: readonly number[],
  timeoutMs: number,
) => Promise<readonly TargetProcessRecord[]>;

export interface TargetDiscoveryOptions {
  discoverProcessAncestry?: boolean;
  environment?: Readonly<Record<string, string | undefined>>;
  inspectProcesses?: InspectProcesses;
  resolveTty?: () => Promise<string | undefined>;
  resolveTmuxWindow?: (paneId: string) => Promise<string | undefined>;
  spawnProcess?: SpawnTtyProcess;
  surfaceId?: string;
  tty?: string;
  tmuxPane?: string;
}

export async function discoverTerminalTarget(
  options: TargetDiscoveryOptions = {},
): Promise<SideGlanceTarget> {
  const target = await discoverTarget(options);
  if (!target) {
    throw new Error(
      "No controlling terminal surface was found; pass --surface or run from a TTY.",
    );
  }
  return target;
}

export async function discoverOptionalTerminalTarget(
  options: TargetDiscoveryOptions = {},
): Promise<SideGlanceTarget | undefined> {
  return discoverTarget(options);
}

async function discoverTarget(
  options: TargetDiscoveryOptions,
): Promise<SideGlanceTarget | undefined> {
  const environment = options.environment ?? process.env;
  const explicitSurface =
    options.surfaceId ??
    environment.SIDE_GLANCE_SURFACE_ID ??
    environment.SIGNAL_SURFACE_ID;
  const explicitTty =
    options.tty ?? environment.SIDE_GLANCE_TTY ?? environment.SIGNAL_TTY;
  const tmuxPane =
    options.tmuxPane ??
    environment.SIDE_GLANCE_TMUX_PANE ??
    environment.SIGNAL_TMUX_PANE ??
    environment.TMUX_PANE;

  if (explicitSurface) validateSurfaceId(explicitSurface);
  if (explicitTty) validateTtyPath(explicitTty);
  if (tmuxPane && !/^%\d+$/u.test(tmuxPane)) {
    throw new Error("tmux pane identity must use the canonical %number form.");
  }

  let tty =
    explicitTty ??
    (explicitSurface || tmuxPane
      ? undefined
      : await (options.resolveTty ??
          (() => resolveControllingTty(options.spawnProcess)))());
  if (
    !tty &&
    !explicitSurface &&
    !tmuxPane &&
    options.discoverProcessAncestry
  ) {
    tty = await resolveProcessAncestryTty(
      options.inspectProcesses ?? inspectProcessesWithPs,
    );
  }
  if (tty) validateTtyPath(tty);

  let surfaceId = explicitSurface;
  if (!surfaceId && tmuxPane && environment.TMUX) {
    validateText(environment.TMUX, "tmux server identity", 1_024);
    const serverIdentity = parseTmuxServerIdentity(environment.TMUX);
    const windowId = serverIdentity
      ? await (options.resolveTmuxWindow ??
          ((paneId: string) => resolveTmuxWindowId(paneId, environment)))(tmuxPane)
      : undefined;
    if (windowId !== undefined && !/^@\d+$/u.test(windowId)) {
      throw new Error("tmux window identity must use the canonical @number form.");
    }
    surfaceId =
      windowId && serverIdentity
        ? `tmux:${serverIdentity.surfaceIdentity},${windowId}`
        : undefined;
  }
  surfaceId ??= tty ? `tty:${tty}` : undefined;
  if (!surfaceId) return undefined;

  return {
    surfaceId,
    ...(tty ? { tty } : {}),
    ...(tmuxPane ? { tmuxPane } : {}),
  };
}

async function resolveTmuxWindowId(
  paneId: string,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<string | undefined> {
  const tmuxIdentity = environment.TMUX;
  const socketPath = tmuxIdentity
    ? parseTmuxServerIdentity(tmuxIdentity)?.socketPath
    : undefined;
  if (!socketPath || !path.isAbsolute(socketPath) || socketPath.includes("\u0000")) {
    return undefined;
  }

  try {
    const { stdout } = await execFileAsync(
      "tmux",
      ["-S", socketPath, "display-message", "-p", "-t", paneId, "#{window_id}"],
      {
        encoding: "utf8",
        env: { ...process.env, ...environment },
        maxBuffer: 4_096,
        timeout: 2_000,
      },
    );
    const windowId = stdout.trim();
    return /^@\d+$/u.test(windowId) ? windowId : undefined;
  } catch {
    return undefined;
  }
}

function parseTmuxServerIdentity(
  tmuxIdentity: string,
): { socketPath: string; surfaceIdentity: string } | undefined {
  const match = /^(.*),([1-9]\d*),(?:0|[1-9]\d*)$/u.exec(tmuxIdentity);
  const socketPath = match?.[1];
  const serverPid = match?.[2];
  if (!socketPath || !serverPid || !path.isAbsolute(socketPath)) return undefined;
  return { socketPath, surfaceIdentity: `${socketPath},${serverPid}` };
}

async function resolveControllingTty(
  spawnProcess: SpawnTtyProcess = defaultSpawnTtyProcess,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    let child: TtyProcess;
    try {
      child = spawnProcess("tty", [], {
        stdio: [process.stdin, "pipe", "ignore"],
      });
    } catch {
      resolve(undefined);
      return;
    }

    let output = "";
    let settled = false;
    function finish(value: string | undefined): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    }

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(undefined);
    }, 2_000);
    timeout.unref();

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (output.length + chunk.length > 4_096) {
        child.kill("SIGTERM");
        finish(undefined);
        return;
      }
      output += chunk;
    });
    child.onError(() => finish(undefined));
    child.onClose((code) => {
      const tty = output.trim();
      finish(code === 0 && tty.startsWith("/dev/") ? tty : undefined);
    });
  });
}

async function resolveProcessAncestryTty(
  inspectProcesses: InspectProcesses,
): Promise<string | undefined> {
  if (typeof process.getuid !== "function") return undefined;
  const uid = process.getuid();
  const deadline = performance.now() + PROCESS_ANCESTRY_TIMEOUT_MS;
  const chain: TargetProcessRecord[] = [];
  const seen = new Set<number>();
  let pid = process.pid;
  let candidate: string | undefined;

  try {
    for (let depth = 0; depth < PROCESS_ANCESTRY_MAX_DEPTH; depth += 1) {
      if (seen.has(pid)) return undefined;
      seen.add(pid);
      const records = await inspectBeforeDeadline(inspectProcesses, [pid], deadline);
      if (records.length !== 1) return undefined;
      const record = validateProcessRecord(records[0], pid, uid);
      chain.push(record);
      candidate = ttyPathFromProcessToken(record.tty);
      if (candidate) break;
      if (record.ppid <= 1) return undefined;
      pid = record.ppid;
    }
    if (!candidate) return undefined;

    const confirmed = await inspectBeforeDeadline(
      inspectProcesses,
      chain.map(({ pid: chainPid }) => chainPid),
      deadline,
    );
    if (confirmed.length !== chain.length) return undefined;
    const confirmedByPid = new Map<number, TargetProcessRecord>();
    for (const record of confirmed) {
      if (confirmedByPid.has(record.pid)) return undefined;
      confirmedByPid.set(record.pid, record);
    }
    for (const original of chain) {
      const record = confirmedByPid.get(original.pid);
      if (!record) return undefined;
      const validated = validateProcessRecord(record, original.pid, uid);
      if (!sameProcessRecord(original, validated)) return undefined;
    }
    const confirmedCandidate = firstTtyInChain(
      chain.map(({ pid: chainPid }) => confirmedByPid.get(chainPid)!),
    );
    return confirmedCandidate === candidate ? candidate : undefined;
  } catch {
    return undefined;
  }
}

async function inspectBeforeDeadline(
  inspectProcesses: InspectProcesses,
  pids: readonly number[],
  deadline: number,
): Promise<readonly TargetProcessRecord[]> {
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw new Error("Process ancestry discovery timed out.");
  const records = await inspectProcesses(pids, remaining);
  if (performance.now() > deadline) {
    throw new Error("Process ancestry discovery timed out.");
  }
  return records;
}

function validateProcessRecord(
  record: TargetProcessRecord | undefined,
  expectedPid: number,
  expectedUid: number,
): TargetProcessRecord {
  if (
    !record ||
    !Number.isSafeInteger(record.pid) ||
    record.pid !== expectedPid ||
    !Number.isSafeInteger(record.ppid) ||
    record.ppid < 0 ||
    !Number.isSafeInteger(record.uid) ||
    record.uid !== expectedUid
  ) {
    throw new Error("Process ancestry record did not match the requested process.");
  }
  validateText(record.startedAt, "process start identity", 160);
  validateText(record.tty, "process TTY", 64);
  ttyPathFromProcessToken(record.tty);
  return record;
}

function firstTtyInChain(
  records: readonly TargetProcessRecord[],
): string | undefined {
  for (const record of records) {
    const tty = ttyPathFromProcessToken(record.tty);
    if (tty) return tty;
  }
  return undefined;
}

function ttyPathFromProcessToken(token: string): string | undefined {
  if (["?", "??", "-"].includes(token)) return undefined;
  if (!/^(?:ttys?\d+|pts\/\d+)$/u.test(token)) {
    throw new Error("Process TTY was not a canonical device token.");
  }
  return `/dev/${token}`;
}

function sameProcessRecord(
  left: TargetProcessRecord,
  right: TargetProcessRecord,
): boolean {
  return (
    left.pid === right.pid &&
    left.ppid === right.ppid &&
    left.uid === right.uid &&
    left.tty === right.tty &&
    left.startedAt === right.startedAt
  );
}

async function inspectProcessesWithPs(
  pids: readonly number[],
  timeoutMs: number,
): Promise<readonly TargetProcessRecord[]> {
  const executable =
    process.platform === "darwin"
      ? "/bin/ps"
      : process.platform === "linux"
        ? "/usr/bin/ps"
        : undefined;
  if (!executable || pids.length === 0) return [];
  if (
    pids.length > PROCESS_ANCESTRY_MAX_DEPTH ||
    pids.some((pid) => !Number.isSafeInteger(pid) || pid <= 0)
  ) {
    throw new Error("Process inspection received an invalid PID set.");
  }
  const { stdout } = await execFileAsync(
    executable,
    [
      "-ww",
      "-o",
      "pid=",
      "-o",
      "ppid=",
      "-o",
      "uid=",
      "-o",
      "tty=",
      "-o",
      "lstart=",
      "-p",
      pids.join(","),
    ],
    {
      encoding: "utf8",
      env: {
        LANG: "C",
        LC_ALL: "C",
        NODE_ENV: process.env.NODE_ENV ?? "production",
        PATH: "/usr/bin:/bin",
      },
      maxBuffer: PROCESS_INSPECTION_MAX_BYTES,
      timeout: Math.max(
        1,
        Math.min(Math.floor(timeoutMs), PROCESS_ANCESTRY_TIMEOUT_MS),
      ),
    },
  );
  return parseProcessRecords(stdout);
}

function parseProcessRecords(stdout: string): TargetProcessRecord[] {
  if (stdout.length > PROCESS_INSPECTION_MAX_BYTES) {
    throw new Error("Process inspection output exceeded its limit.");
  }
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  return trimmed.split("\n").map((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/u.exec(line);
    if (!match) throw new Error("Process inspection returned malformed output.");
    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    const uid = Number(match[3]);
    if (
      !Number.isSafeInteger(pid) ||
      !Number.isSafeInteger(ppid) ||
      !Number.isSafeInteger(uid)
    ) {
      throw new Error("Process inspection returned an invalid numeric field.");
    }
    return {
      pid,
      ppid,
      uid,
      tty: match[4]!,
      startedAt: match[5]!,
    };
  });
}

function defaultSpawnTtyProcess(
  command: string,
  arguments_: string[],
  options: TtySpawnOptions,
): TtyProcess {
  const child = spawn(command, arguments_, options);
  if (!child.stdout) throw new Error("tty stdout was unavailable.");
  return {
    stdout: child.stdout,
    kill: (signal) => child.kill(signal),
    onClose: (listener) => {
      child.once("close", (code) => listener(code));
    },
    onError: (listener) => {
      child.once("error", listener);
    },
  };
}

function validateTtyPath(value: string): void {
  if (!/^\/dev\/(?:ttys?\d+|pts\/\d+)$/u.test(value)) {
    throw new Error("TTY device must be a canonical /dev/tty* or /dev/pts/* path.");
  }
}

function validateSurfaceId(value: string): void {
  validateText(value, "surface ID", 512);
}

function validateText(value: string, label: string, maximum: number): void {
  if (value.length === 0 || [...value].length > maximum) {
    throw new Error(`${label} must contain 1 to ${maximum} characters.`);
  }
  if ([...value].some(isControlCharacter)) {
    throw new Error(`${label} may not contain control characters.`);
  }
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
}
