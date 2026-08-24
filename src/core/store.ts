import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

import { createSideGlanceState } from "./reducer.ts";
import type {
  SideGlanceConfidence,
  SideGlancePhase,
  SideGlanceSessionState,
  SideGlanceSource,
  SideGlanceState,
  SideGlanceSurfaceState,
} from "./protocol.ts";

const execFileAsync = promisify(execFile);
const STATE_FILENAME = "side-glance-state.json";
const LEGACY_STATE_FILENAME = "signal-state.json";
const LOCK_DIRECTORY = ".side-glance-state.lock";
const OWNER_FILENAME = "owner.json";
const MAX_STATE_BYTES = 1_048_576;
const DEFAULT_STALE_LOCK_MS = 30_000;
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_RETRY_DELAY_MS = 10;

const SOURCES = new Set<SideGlanceSource>([
  "claude",
  "codex",
  "gemini",
  "opencode",
  "aider",
  "generic",
]);
const PHASES = new Set<SideGlancePhase>([
  "inactive",
  "working",
  "waiting",
  "completed",
  "failed",
]);
const CONFIDENCES = new Set<SideGlanceConfidence>([
  "native",
  "notification",
  "wrapper",
  "heuristic",
]);

interface LockOwner {
  pid: number;
  createdAt: number;
  nonce: string;
  processIdentity?: string;
}

export interface FileSideGlanceStoreOptions {
  directory: string;
  legacyDirectory?: string;
  staleLockMs?: number;
  lockTimeoutMs?: number;
  retryDelayMs?: number;
}

export type SideGlanceStateUpdate = (
  current: SideGlanceState,
) => SideGlanceState | Promise<SideGlanceState>;

export class FileSideGlanceStore {
  private readonly directory: string;
  private readonly statePath: string;
  private readonly legacyStatePath?: string;
  private readonly lockPath: string;
  private readonly staleLockMs: number;
  private readonly lockTimeoutMs: number;
  private readonly retryDelayMs: number;

  constructor(options: FileSideGlanceStoreOptions) {
    if (!path.isAbsolute(options.directory)) {
      throw new Error("Side Glance state directory must be an absolute path.");
    }
    if (options.legacyDirectory && !path.isAbsolute(options.legacyDirectory)) {
      throw new Error("Legacy state directory must be an absolute path.");
    }

    this.directory = path.resolve(options.directory);
    this.statePath = path.join(this.directory, STATE_FILENAME);
    this.legacyStatePath = options.legacyDirectory
      ? path.join(path.resolve(options.legacyDirectory), LEGACY_STATE_FILENAME)
      : undefined;
    this.lockPath = path.join(this.directory, LOCK_DIRECTORY);
    this.staleLockMs = positiveOption(
      options.staleLockMs,
      DEFAULT_STALE_LOCK_MS,
      "staleLockMs",
    );
    this.lockTimeoutMs = positiveOption(
      options.lockTimeoutMs,
      DEFAULT_LOCK_TIMEOUT_MS,
      "lockTimeoutMs",
    );
    this.retryDelayMs = positiveOption(
      options.retryDelayMs,
      DEFAULT_RETRY_DELAY_MS,
      "retryDelayMs",
    );
  }

  async read(): Promise<SideGlanceState> {
    return this.withLock(() => this.readUnlocked());
  }

  async update(transform: SideGlanceStateUpdate): Promise<SideGlanceState> {
    return this.withLock(async () => {
      const current = await this.readUnlocked();
      const next = await transform(current);
      if (!isSideGlanceState(next)) {
        throw new Error("Refusing to persist invalid Side Glance state.");
      }
      await this.writeAtomic(next);
      return next;
    });
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.ensurePrivateDirectory();
    const owner = await this.acquireLock();
    try {
      return await operation();
    } finally {
      await this.releaseLock(owner);
    }
  }

  private async ensurePrivateDirectory(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const metadata = await lstat(this.directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error("Side Glance state path must be a real directory.");
    }
    await chmod(this.directory, 0o700);
  }

  private async acquireLock(): Promise<LockOwner> {
    const startedAt = Date.now();
    const processIdentity = await currentProcessIdentity();
    const owner: LockOwner = {
      pid: process.pid,
      createdAt: startedAt,
      nonce: randomUUID(),
      ...(processIdentity ? { processIdentity } : {}),
    };

    while (Date.now() - startedAt <= this.lockTimeoutMs) {
      try {
        await mkdir(this.lockPath, { mode: 0o700 });
        try {
          await this.writeLockOwner(owner);
          return owner;
        } catch (error) {
          await rm(this.lockPath, { recursive: true, force: true });
          throw error;
        }
      } catch (error) {
        if (!hasCode(error, "EEXIST")) throw error;
      }

      if (await this.reclaimDeadStaleLock()) continue;
      await delay(this.retryDelayMs);
    }

    throw new Error(
      `Timed out waiting for Side Glance state lock after ${this.lockTimeoutMs}ms.`,
    );
  }

  private async writeLockOwner(owner: LockOwner): Promise<void> {
    const ownerPath = path.join(this.lockPath, OWNER_FILENAME);
    const handle = await open(
      ownerPath,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async reclaimDeadStaleLock(): Promise<boolean> {
    let lockMetadata;
    try {
      lockMetadata = await stat(this.lockPath);
    } catch (error) {
      if (hasCode(error, "ENOENT")) return true;
      throw error;
    }

    if (Date.now() - lockMetadata.mtimeMs <= this.staleLockMs) return false;

    const owner = await this.readLockOwner();
    if (!owner || Date.now() - owner.createdAt <= this.staleLockMs) return false;
    if (await sameProcessIsAlive(owner)) return false;

    const confirmedOwner = await this.readLockOwner();
    if (!confirmedOwner || confirmedOwner.nonce !== owner.nonce) return false;

    await rm(this.lockPath, { recursive: true, force: true });
    return true;
  }

  private async readLockOwner(): Promise<LockOwner | undefined> {
    try {
      const raw = await readFile(path.join(this.lockPath, OWNER_FILENAME), "utf8");
      const value: unknown = JSON.parse(raw);
      return isLockOwner(value) ? value : undefined;
    } catch (error) {
      if (hasCode(error, "ENOENT") || error instanceof SyntaxError) {
        return undefined;
      }
      throw error;
    }
  }

  private async releaseLock(owner: LockOwner): Promise<void> {
    const current = await this.readLockOwner();
    if (current?.nonce !== owner.nonce) return;
    await rm(this.lockPath, { recursive: true, force: true });
  }

  private async readUnlocked(): Promise<SideGlanceState> {
    let raw: string;
    try {
      const metadata = await lstat(this.statePath);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error("Side Glance state must be a regular file, not a link.");
      }
      if (metadata.size > MAX_STATE_BYTES) {
        return this.quarantineAndReset();
      }

      const handle = await open(
        this.statePath,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        raw = await handle.readFile("utf8");
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
      const legacy = await this.readLegacyState();
      if (legacy) {
        await this.writeAtomic(legacy);
        return legacy;
      }
      const initial = createSideGlanceState();
      await this.writeAtomic(initial);
      return initial;
    }

    try {
      const value: unknown = JSON.parse(raw);
      if (!isSideGlanceState(value)) return this.quarantineAndReset();
      await chmod(this.statePath, 0o600);
      return value;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return this.quarantineAndReset();
    }
  }

  private async readLegacyState(): Promise<SideGlanceState | undefined> {
    if (!this.legacyStatePath) return undefined;
    let metadata;
    try {
      metadata = await lstat(this.legacyStatePath);
    } catch (error) {
      if (hasCode(error, "ENOENT")) return undefined;
      throw error;
    }
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("Legacy state must be a regular file, not a link.");
    }
    if (metadata.size > MAX_STATE_BYTES) return undefined;

    const handle = await open(
      this.legacyStatePath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const value: unknown = JSON.parse(await handle.readFile("utf8"));
      return isSideGlanceState(value) ? value : undefined;
    } catch (error) {
      if (error instanceof SyntaxError) return undefined;
      throw error;
    } finally {
      await handle.close();
    }
  }

  private async quarantineAndReset(): Promise<SideGlanceState> {
    const quarantinePath = path.join(
      this.directory,
      `side-glance-state.corrupt-${Date.now()}-${randomUUID()}.json`,
    );
    try {
      await rename(this.statePath, quarantinePath);
      await chmod(quarantinePath, 0o600);
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
    }

    const reset = createSideGlanceState();
    await this.writeAtomic(reset);
    return reset;
  }

  private async writeAtomic(state: SideGlanceState): Promise<void> {
    const temporaryPath = path.join(
      this.directory,
      `.side-glance-state.${process.pid}.${randomUUID()}.tmp`,
    );
    let handle;
    try {
      handle = await open(
        temporaryPath,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      );
      await handle.writeFile(`${JSON.stringify(state)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, this.statePath);
      await chmod(this.statePath, 0o600);
    } finally {
      if (handle) await handle.close();
      await unlink(temporaryPath).catch((error: unknown) => {
        if (!hasCode(error, "ENOENT")) throw error;
      });
    }
  }
}

let ownProcessIdentity: Promise<string | undefined> | undefined;

function currentProcessIdentity(): Promise<string | undefined> {
  ownProcessIdentity ??= processIdentity(process.pid);
  return ownProcessIdentity;
}

async function sameProcessIsAlive(owner: LockOwner): Promise<boolean> {
  try {
    process.kill(owner.pid, 0);
  } catch (error) {
    if (hasCode(error, "ESRCH")) return false;
    return true;
  }

  if (!owner.processIdentity) return true;
  const currentIdentity = await processIdentity(owner.pid);
  return currentIdentity === undefined || currentIdentity === owner.processIdentity;
}

async function processIdentity(pid: number): Promise<string | undefined> {
  if (process.platform === "linux") {
    try {
      const processStat = (await readFile(`/proc/${pid}/stat`, "utf8")).trim();
      const commandEnd = processStat.lastIndexOf(")");
      const fieldsAfterCommand = processStat.slice(commandEnd + 2).split(" ");
      return fieldsAfterCommand[19]
        ? `linux:${fieldsAfterCommand[19]}`
        : undefined;
    } catch {
      return undefined;
    }
  }

  if (process.platform === "darwin") {
    try {
      const { stdout } = await execFileAsync("ps", ["-o", "lstart=", "-p", String(pid)]);
      const started = stdout.trim();
      return started ? `darwin:${started}` : undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function isSideGlanceState(value: unknown): value is SideGlanceState {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== 1) return false;
  if (!isRecord(value.sessions)) return false;
  if (!isRecord(value.surfaces)) return false;
  if (
    !Array.isArray(value.seenEventIds) ||
    value.seenEventIds.some((eventId) => typeof eventId !== "string")
  ) {
    return false;
  }

  return (
    Object.values(value.sessions).every(isSideGlanceSessionState) &&
    Object.values(value.surfaces).every(isSideGlanceSurfaceState)
  );
}

function isSideGlanceSessionState(value: unknown): value is SideGlanceSessionState {
  if (!isRecord(value)) return false;
  if (typeof value.source !== "string" || !SOURCES.has(value.source as SideGlanceSource)) {
    return false;
  }
  if (typeof value.sessionId !== "string" || value.sessionId.length === 0) {
    return false;
  }
  if (typeof value.phase !== "string" || !PHASES.has(value.phase as SideGlancePhase)) {
    return false;
  }
  if (!Number.isSafeInteger(value.generation) || Number(value.generation) < 0) {
    return false;
  }
  if (
    typeof value.confidence !== "string" ||
    !CONFIDENCES.has(value.confidence as SideGlanceConfidence)
  ) {
    return false;
  }
  if (!Number.isFinite(value.updatedAt)) return false;
  if (value.startedAt !== undefined && !Number.isFinite(value.startedAt)) return false;
  if (value.completedAt !== undefined && !Number.isFinite(value.completedAt)) {
    return false;
  }
  if (
    value.responseEwmaSeconds !== undefined &&
    (!Number.isFinite(value.responseEwmaSeconds) ||
      Number(value.responseEwmaSeconds) < 0)
  ) {
    return false;
  }
  if (value.turnId !== undefined && typeof value.turnId !== "string") return false;
  if (
    value.wrapperSessionId !== undefined &&
    typeof value.wrapperSessionId !== "string"
  ) {
    return false;
  }
  if (value.reason !== undefined && typeof value.reason !== "string") return false;
  if (
    value.leaseExpiresAt !== undefined &&
    !Number.isFinite(value.leaseExpiresAt)
  ) {
    return false;
  }
  if (value.target !== undefined && !isSideGlanceTarget(value.target)) return false;
  return true;
}

function isSideGlanceTarget(value: unknown): boolean {
  if (!isRecord(value) || typeof value.surfaceId !== "string") return false;
  if (value.tty !== undefined && typeof value.tty !== "string") return false;
  if (value.tmuxPane !== undefined && typeof value.tmuxPane !== "string") return false;
  return true;
}

function isSideGlanceSurfaceState(value: unknown): value is SideGlanceSurfaceState {
  if (!isRecord(value)) return false;
  if (typeof value.surfaceId !== "string" || !isSideGlanceTarget(value.target)) {
    return false;
  }
  if (typeof value.phase !== "string" || !PHASES.has(value.phase as SideGlancePhase)) {
    return false;
  }
  if (!Number.isSafeInteger(value.generation) || Number(value.generation) < 0) {
    return false;
  }
  if (!Number.isFinite(value.updatedAt) || typeof value.terminalPainted !== "boolean") {
    return false;
  }
  if (value.ownerKey !== undefined && typeof value.ownerKey !== "string") {
    return false;
  }
  if (value.tmuxSnapshot !== undefined && !isTmuxSnapshot(value.tmuxSnapshot)) {
    return false;
  }
  return true;
}

function isTmuxSnapshot(value: unknown): boolean {
  if (!isRecord(value) || !/^@\d+$/u.test(String(value.windowId))) return false;
  if (!Array.isArray(value.options) || value.options.length !== 4) return false;
  const names = new Set([
    "window-status-style",
    "window-status-current-style",
    "window-status-format",
    "window-status-current-format",
  ]);
  return value.options.every(
    (option) =>
      isRecord(option) &&
      typeof option.name === "string" &&
      names.has(option.name) &&
      typeof option.local === "boolean" &&
      (option.value === undefined || typeof option.value === "string") &&
      option.local === (option.value !== undefined),
  );
}

function isLockOwner(value: unknown): value is LockOwner {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.pid) &&
    Number(value.pid) > 0 &&
    Number.isFinite(value.createdAt) &&
    typeof value.nonce === "string" &&
    value.nonce.length > 0 &&
    (value.processIdentity === undefined || typeof value.processIdentity === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveOption(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new Error(`${name} must be a finite positive number.`);
  }
  return resolved;
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
