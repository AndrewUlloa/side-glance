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

import {
  captureConfigTarget,
  captureConfigTargetParents,
  ConfigTargetConflictError,
  ensureConfigTargetParentDirectories,
  revalidateConfigTargetSnapshot,
  sensitiveConfigTargetSnapshotBytes,
} from "../adapters/config-target.ts";

import { createSideGlanceState } from "./reducer.ts";
import {
  SIDE_GLANCE_ACTIVE_WORK_LIMIT,
  sessionKey,
  type SideGlanceConfidence,
  type SideGlanceDurationProfile,
  type SideGlancePhase,
  type SideGlanceSessionState,
  type SideGlanceSource,
  type SideGlanceState,
  type SideGlanceSurfaceState,
  type SideGlanceTarget,
  type SideGlanceWorkKind,
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
const WORK_KINDS = new Set<SideGlanceWorkKind>([
  "subagent",
  "background-task",
  "session-cron",
]);
const STATE_V1_FIELDS = new Set([
  "schemaVersion",
  "sessions",
  "surfaces",
  "seenEventIds",
]);
const STATE_V2_FIELDS = new Set([...STATE_V1_FIELDS, "durationProfiles"]);
const DURATION_PROFILE_FIELDS = new Set([
  "algorithmVersion",
  "samplesSeconds",
  "ceilingSeconds",
]);
const SESSION_FIELDS = new Set([
  "source",
  "sessionId",
  "phase",
  "generation",
  "turnId",
  "wrapperSessionId",
  "reason",
  "confidence",
  "target",
  "startedAt",
  "completedAt",
  "responseEwmaSeconds",
  "completionCeilingSeconds",
  "completionSnapshotKey",
  "activeWork",
  "activeWorkUpdatedAt",
  "durationSampleKey",
  "endedAt",
  "leaseExpiresAt",
  "updatedAt",
]);
const WORK_FIELDS = new Set(["id", "kind"]);
const TARGET_FIELDS = new Set(["surfaceId", "tty", "tmuxPane"]);
const SURFACE_FIELDS = new Set([
  "surfaceId",
  "target",
  "phase",
  "generation",
  "updatedAt",
  "terminalPainted",
  "terminalTitlePainted",
  "ownerKey",
  "tmuxSnapshot",
]);
const TMUX_SNAPSHOT_FIELDS = new Set(["windowId", "options"]);
const TMUX_OPTION_FIELDS = new Set(["name", "local", "value"]);

interface LockOwner {
  pid: number;
  createdAt: number;
  nonce: string;
  processIdentity?: string;
}

export interface FileSideGlanceStoreOptions {
  directory: string;
  rootDirectory: string;
  legacyDirectory?: string;
  legacyRootDirectory?: string;
  staleLockMs?: number;
  lockTimeoutMs?: number;
  retryDelayMs?: number;
}

export type SideGlanceStateUpdate = (
  current: SideGlanceState,
) => SideGlanceState | Promise<SideGlanceState>;

export class FileSideGlanceStore {
  private readonly directory: string;
  private readonly rootDirectory: string;
  private readonly statePath: string;
  private readonly legacyStatePath?: string;
  private readonly legacyRootDirectory?: string;
  private readonly lockPath: string;
  private readonly staleLockMs: number;
  private readonly lockTimeoutMs: number;
  private readonly retryDelayMs: number;

  constructor(options: FileSideGlanceStoreOptions) {
    if (!path.isAbsolute(options.directory) || !path.isAbsolute(options.rootDirectory)) {
      throw new Error("Side Glance state directory and trust root must be absolute paths.");
    }
    if (options.legacyDirectory && !path.isAbsolute(options.legacyDirectory)) {
      throw new Error("Legacy state directory must be an absolute path.");
    }
    if (
      options.legacyDirectory &&
      (!options.legacyRootDirectory || !path.isAbsolute(options.legacyRootDirectory))
    ) {
      throw new Error("Legacy state trust root must be an absolute path.");
    }

    this.directory = path.resolve(options.directory);
    this.rootDirectory = path.resolve(options.rootDirectory);
    this.statePath = path.join(this.directory, STATE_FILENAME);
    this.legacyStatePath = options.legacyDirectory
      ? path.join(path.resolve(options.legacyDirectory), LEGACY_STATE_FILENAME)
      : undefined;
    this.legacyRootDirectory = options.legacyRootDirectory
      ? path.resolve(options.legacyRootDirectory)
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
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const snapshot = await captureConfigTargetParents({
          rootDirectory: this.rootDirectory,
          targetPath: path.join(this.directory, ".side-glance-parent-guard"),
          label: "Side Glance state",
          maxBytes: 1,
          defaultMode: 0o600,
        });
        await ensureConfigTargetParentDirectories(snapshot, 0o700);
        return;
      } catch (error) {
        if (!(error instanceof ConfigTargetConflictError) || attempt === 2) {
          throw error;
        }
      }
    }
    throw new Error("Side Glance state directory could not be captured safely.");
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
      const normalized = normalizeSideGlanceState(value);
      if (!normalized) return this.quarantineAndReset();
      await chmod(this.statePath, 0o600);
      return normalized;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return this.quarantineAndReset();
    }
  }

  private async readLegacyState(): Promise<SideGlanceState | undefined> {
    if (!this.legacyStatePath || !this.legacyRootDirectory) return undefined;
    const snapshot = await captureConfigTarget({
      rootDirectory: this.legacyRootDirectory,
      targetPath: this.legacyStatePath,
      label: "Legacy Side Glance state",
      maxBytes: MAX_STATE_BYTES,
      defaultMode: 0o600,
    });
    await revalidateConfigTargetSnapshot(snapshot);
    const bytes = sensitiveConfigTargetSnapshotBytes(snapshot);
    if (!bytes) return undefined;
    try {
      const value: unknown = JSON.parse(bytes.toString("utf8"));
      return normalizeSideGlanceState(value);
    } catch (error) {
      if (error instanceof SyntaxError) return undefined;
      throw error;
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
  if (value.schemaVersion !== 2) return false;
  if (!hasExactFields(value, STATE_V2_FIELDS)) return false;
  if (!isCommonSideGlanceState(value)) return false;
  if (!isRecord(value.durationProfiles)) return false;
  return Object.entries(value.durationProfiles).every(
    ([source, profile]) =>
      SOURCES.has(source as SideGlanceSource) && isDurationProfile(profile),
  );
}

function normalizeSideGlanceState(value: unknown): SideGlanceState | undefined {
  if (!isRecord(value) || !isCommonSideGlanceState(value)) return undefined;
  if (value.schemaVersion === 2 && isSideGlanceState(value)) return value;
  if (value.schemaVersion !== 1 || !hasExactFields(value, STATE_V1_FIELDS)) {
    return undefined;
  }

  return {
    schemaVersion: 2,
    sessions: value.sessions as SideGlanceState["sessions"],
    surfaces: value.surfaces as SideGlanceState["surfaces"],
    seenEventIds: value.seenEventIds as string[],
    durationProfiles: {},
  };
}

function isCommonSideGlanceState(value: Record<string, unknown>): boolean {
  if (!isRecord(value.sessions)) return false;
  if (!isRecord(value.surfaces)) return false;
  if (
    !Array.isArray(value.seenEventIds) ||
    value.seenEventIds.length > 4_096 ||
    value.seenEventIds.some((eventId) => !isBoundedText(eventId, 160))
  ) {
    return false;
  }

  return (
    Object.entries(value.sessions).every(
      ([key, session]) =>
        isSideGlanceSessionState(session) &&
        key === sessionKey(session.source, session.sessionId),
    ) &&
    Object.entries(value.surfaces).every(
      ([key, surface]) =>
        isSideGlanceSurfaceState(surface) && key === surface.surfaceId,
    )
  );
}

function isDurationProfile(value: unknown): value is SideGlanceDurationProfile {
  return (
    isRecord(value) &&
    hasExactFields(value, DURATION_PROFILE_FIELDS) &&
    value.algorithmVersion === 1 &&
    Array.isArray(value.samplesSeconds) &&
    value.samplesSeconds.length <= 12 &&
    value.samplesSeconds.every(
      (sample) =>
        Number.isSafeInteger(sample) && Number(sample) >= 1 && Number(sample) <= 28_800,
    ) &&
    Number.isSafeInteger(value.ceilingSeconds) &&
    Number(value.ceilingSeconds) >= 60 &&
    Number(value.ceilingSeconds) <= 7_200 &&
    (value.samplesSeconds.length >= 8 || value.ceilingSeconds === 300)
  );
}

function isSideGlanceSessionState(value: unknown): value is SideGlanceSessionState {
  if (!isRecord(value)) return false;
  if (!hasExactFields(value, SESSION_FIELDS)) return false;
  if (typeof value.source !== "string" || !SOURCES.has(value.source as SideGlanceSource)) {
    return false;
  }
  if (!isBoundedText(value.sessionId, 256)) {
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
  if (
    value.completionCeilingSeconds !== undefined &&
    (!Number.isFinite(value.completionCeilingSeconds) ||
      Number(value.completionCeilingSeconds) < 60 ||
      Number(value.completionCeilingSeconds) > 7_200)
  ) {
    return false;
  }
  if (
    value.activeWork !== undefined &&
    (!Array.isArray(value.activeWork) ||
      value.activeWork.length > SIDE_GLANCE_ACTIVE_WORK_LIMIT ||
      value.activeWork.some(
        (work) =>
          !isRecord(work) ||
          !hasExactFields(work, WORK_FIELDS) ||
          !isBoundedText(work.id, 160) ||
          typeof work.kind !== "string" ||
          !WORK_KINDS.has(work.kind as SideGlanceWorkKind),
      ) ||
      new Set(
        value.activeWork.flatMap((work) =>
          isRecord(work) && typeof work.id === "string" ? [work.id] : [],
        ),
      ).size !== value.activeWork.length)
  ) {
    return false;
  }
  if (
    value.activeWorkUpdatedAt !== undefined &&
    !Number.isFinite(value.activeWorkUpdatedAt)
  ) {
    return false;
  }
  if (value.turnId !== undefined && !isBoundedText(value.turnId, 256)) return false;
  if (
    value.wrapperSessionId !== undefined &&
    !isBoundedText(value.wrapperSessionId, 256)
  ) {
    return false;
  }
  if (value.reason !== undefined && !isBoundedText(value.reason, 256)) return false;
  if (
    value.durationSampleKey !== undefined &&
    !isBoundedText(value.durationSampleKey, 272)
  ) {
    return false;
  }
  if (
    value.completionSnapshotKey !== undefined &&
    !isBoundedText(value.completionSnapshotKey, 272)
  ) {
    return false;
  }
  if (value.endedAt !== undefined && !Number.isFinite(value.endedAt)) {
    return false;
  }
  if (
    value.leaseExpiresAt !== undefined &&
    !Number.isFinite(value.leaseExpiresAt)
  ) {
    return false;
  }
  if (value.target !== undefined && !isSideGlanceTarget(value.target)) return false;
  return true;
}

function isSideGlanceTarget(value: unknown): value is SideGlanceTarget {
  if (
    !isRecord(value) ||
    !hasExactFields(value, TARGET_FIELDS) ||
    !isBoundedText(value.surfaceId, 512)
  ) {
    return false;
  }
  if (value.tty !== undefined && !isBoundedText(value.tty, 1_024)) return false;
  if (
    value.tmuxPane !== undefined &&
    (!isBoundedText(value.tmuxPane, 64) || !/^%\d+$/u.test(value.tmuxPane))
  ) {
    return false;
  }
  return true;
}

function isSideGlanceSurfaceState(value: unknown): value is SideGlanceSurfaceState {
  if (!isRecord(value)) return false;
  if (!hasExactFields(value, SURFACE_FIELDS)) return false;
  if (
    !isBoundedText(value.surfaceId, 512) ||
    !isSideGlanceTarget(value.target) ||
    value.target.surfaceId !== value.surfaceId
  ) {
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
  if (
    value.terminalTitlePainted !== undefined &&
    typeof value.terminalTitlePainted !== "boolean"
  ) {
    return false;
  }
  if (value.ownerKey !== undefined && !isBoundedText(value.ownerKey, 768)) {
    return false;
  }
  if (value.tmuxSnapshot !== undefined && !isTmuxSnapshot(value.tmuxSnapshot)) {
    return false;
  }
  return true;
}

function isTmuxSnapshot(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactFields(value, TMUX_SNAPSHOT_FIELDS) ||
    !/^@\d+$/u.test(String(value.windowId))
  ) {
    return false;
  }
  if (!Array.isArray(value.options) || value.options.length !== 4) return false;
  const names = new Set([
    "window-status-style",
    "window-status-current-style",
    "window-status-format",
    "window-status-current-format",
  ]);
  const valid = value.options.every(
    (option) =>
      isRecord(option) &&
      hasExactFields(option, TMUX_OPTION_FIELDS) &&
      typeof option.name === "string" &&
      names.has(option.name) &&
      typeof option.local === "boolean" &&
      (option.value === undefined ||
        (typeof option.value === "string" &&
          option.value.length <= 16_384 &&
          !option.value.includes("\u0000"))) &&
      option.local === (option.value !== undefined),
  );
  return (
    valid &&
    new Set(
      value.options.flatMap((option) =>
        isRecord(option) && typeof option.name === "string" ? [option.name] : [],
      ),
    ).size === value.options.length
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

function hasExactFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((field) => allowed.has(field));
}

function isBoundedText(value: unknown, maximumCodePoints: number): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  const characters = [...value];
  return (
    characters.length <= maximumCodePoints &&
    characters.every((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 0x1f && !(codePoint >= 0x7f && codePoint <= 0x9f);
    })
  );
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
