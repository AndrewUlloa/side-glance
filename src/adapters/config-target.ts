import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  link,
  mkdir,
  open,
  readdir,
  rename,
  rmdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";

export class ConfigTargetConflictError extends Error {
  constructor(message = "Configuration target changed during update; no changes made.") {
    super(message);
    this.name = "ConfigTargetConflictError";
  }
}

export interface ConfigTargetDescriptor {
  rootDirectory: string;
  targetPath: string;
  label: string;
  maxBytes: number;
  defaultMode?: number;
}

export interface ConfigTargetSnapshot {
  readonly targetPath: string;
  readonly exists: boolean;
  readonly mode: number;
}

export interface ConfigTargetPlan {
  readonly targetPath: string;
  readonly changed: boolean;
  readonly desiredExists: boolean;
}

export interface ConfigTargetApplication {
  readonly targetPath: string;
  readonly changed: boolean;
  readonly backupPath?: string;
}

export interface ConfigTargetApplyOptions {
  /** Test/fault-injection seam used to prove caught post-commit restoration. */
  afterCommit?(): void | Promise<void>;
}

export interface ConfigWriterLock {
  readonly lockPath: string;
}

interface DirectoryIdentity {
  path: string;
  device: bigint;
  inode: bigint;
}

interface FileState {
  bytes: Buffer;
  mode: number;
  device: bigint;
  inode: bigint;
  modifiedAtMs: number;
}

interface SnapshotState {
  descriptor: Required<ConfigTargetDescriptor>;
  directories: DirectoryIdentity[];
  missingDirectories: string[];
  file?: FileState;
}

interface PlanState {
  snapshot: ConfigTargetSnapshot;
  desiredBytes?: Buffer;
  desiredMode: number;
  backupExisting: boolean;
  backupPrepared: boolean;
  backupPath?: string;
  backupFile?: FileState;
}

interface ApplicationState {
  plan: ConfigTargetPlan;
  effectiveDirectories: DirectoryIdentity[];
  createdDirectories: DirectoryIdentity[];
  appliedFile?: FileState;
}

interface LockState {
  lockPath: string;
  bytes: Buffer;
  device: bigint;
  inode: bigint;
  modifiedAtMs: number;
  released: boolean;
}

const snapshotStates = new WeakMap<ConfigTargetSnapshot, SnapshotState>();
const planStates = new WeakMap<ConfigTargetPlan, PlanState>();
const applicationStates = new WeakMap<
  ConfigTargetApplication,
  ApplicationState
>();
const lockStates = new WeakMap<ConfigWriterLock, LockState>();
const INCOMPLETE_LOCK_RECOVERY_AGE_MS = 60_000;

export async function captureConfigTarget(
  descriptor: ConfigTargetDescriptor,
): Promise<ConfigTargetSnapshot> {
  const normalized = normalizeDescriptor(descriptor);
  const { directories, missingDirectories } = await captureParentDirectories(
    normalized.rootDirectory,
    normalized.targetPath,
    normalized.label,
  );
  const file =
    missingDirectories.length === 0
      ? await readOptionalRegularFile(
          normalized.targetPath,
          normalized.maxBytes,
          normalized.label,
        )
      : undefined;
  const snapshot = Object.freeze({
    targetPath: normalized.targetPath,
    exists: file !== undefined,
    mode: file?.mode ?? normalized.defaultMode,
  });
  snapshotStates.set(snapshot, {
    descriptor: normalized,
    directories,
    missingDirectories,
    ...(file ? { file } : {}),
  });
  return snapshot;
}

/**
 * Returns a defensive copy of captured configuration bytes for adapter parsing only.
 * These bytes can contain private user configuration and must never enter CLI output,
 * logs, JSON projections, telemetry, or error messages.
 */
export function sensitiveConfigTargetSnapshotBytes(
  snapshot: ConfigTargetSnapshot,
): Buffer | undefined {
  const state = requireSnapshotState(snapshot);
  return state.file ? Buffer.from(state.file.bytes) : undefined;
}

export function planConfigTarget(
  snapshot: ConfigTargetSnapshot,
  desired: string | Uint8Array,
  options: { backupExisting?: boolean; mode?: number } = {},
): ConfigTargetPlan {
  const state = requireSnapshotState(snapshot);
  const desiredBytes =
    typeof desired === "string" ? Buffer.from(desired, "utf8") : Buffer.from(desired);
  if (desiredBytes.length > state.descriptor.maxBytes) {
    throw new Error(`${state.descriptor.label} desired state is too large to write safely.`);
  }
  const desiredMode = options.mode ?? snapshot.mode;
  validateMode(desiredMode);
  const changed =
    state.file === undefined ||
    state.file.mode !== desiredMode ||
    !state.file.bytes.equals(desiredBytes);
  const plan = Object.freeze({
    targetPath: snapshot.targetPath,
    changed,
    desiredExists: true,
  });
  planStates.set(plan, {
    snapshot,
    desiredBytes,
    desiredMode,
    backupExisting: options.backupExisting === true && snapshot.exists,
    backupPrepared: false,
  });
  return plan;
}

export function planConfigTargetRemoval(
  snapshot: ConfigTargetSnapshot,
  options: { backupExisting?: boolean } = {},
): ConfigTargetPlan {
  requireSnapshotState(snapshot);
  const plan = Object.freeze({
    targetPath: snapshot.targetPath,
    changed: snapshot.exists,
    desiredExists: false,
  });
  planStates.set(plan, {
    snapshot,
    desiredMode: snapshot.mode,
    backupExisting: options.backupExisting === true && snapshot.exists,
    backupPrepared: false,
  });
  return plan;
}

export async function revalidateConfigTargetSnapshot(
  snapshot: ConfigTargetSnapshot,
): Promise<void> {
  const state = requireSnapshotState(snapshot);
  await verifyDirectories(state.directories);
  await verifyMissingDirectories(state.missingDirectories);
  await verifyFileMatchesSnapshot(state, state.directories);
}

export async function revalidateConfigTargetPlan(
  plan: ConfigTargetPlan,
): Promise<void> {
  const state = requirePlanState(plan);
  await revalidateConfigTargetSnapshot(state.snapshot);
}

export async function backupConfigTargetPlan(
  plan: ConfigTargetPlan,
): Promise<string | undefined> {
  const state = requirePlanState(plan);
  if (state.backupPrepared) {
    if (state.backupPath && state.backupFile) {
      const current = await readRequiredRegularFile(
        state.backupPath,
        requireSnapshotState(state.snapshot).descriptor.maxBytes,
        "Configuration backup",
      ).catch(() => {
        throw conflict("Configuration backup changed before apply; no changes made.");
      });
      if (!sameFileState(current, state.backupFile)) {
        throw conflict("Configuration backup changed before apply; no changes made.");
      }
    }
    return state.backupPath;
  }
  if (!plan.changed || !state.backupExisting) {
    state.backupPrepared = true;
    return undefined;
  }
  const snapshotState = requireSnapshotState(state.snapshot);
  await revalidateConfigTargetSnapshot(state.snapshot);
  if (!snapshotState.file) {
    throw new Error("Cannot back up an absent configuration target.");
  }
  const backup = await writePrivateBackup(
    plan.targetPath,
    snapshotState.file.bytes,
  );
  state.backupPath = backup.path;
  state.backupFile = backup.file;
  state.backupPrepared = true;
  return state.backupPath;
}

export async function applyConfigTargetPlan(
  plan: ConfigTargetPlan,
  options: ConfigTargetApplyOptions = {},
): Promise<ConfigTargetApplication> {
  const planState = requirePlanState(plan);
  const snapshotState = requireSnapshotState(planState.snapshot);
  if (!plan.changed) {
    await revalidateConfigTargetSnapshot(planState.snapshot);
    const application = Object.freeze({
      targetPath: plan.targetPath,
      changed: false,
    });
    applicationStates.set(application, {
      plan,
      effectiveDirectories: snapshotState.directories,
      createdDirectories: [],
      ...(snapshotState.file ? { appliedFile: snapshotState.file } : {}),
    });
    return application;
  }

  await revalidateConfigTargetSnapshot(planState.snapshot);
  const createdDirectories = await createMissingDirectories(snapshotState);
  const effectiveDirectories = [
    ...snapshotState.directories,
    ...createdDirectories,
  ];
  let committed = false;
  let application: ConfigTargetApplication | undefined;
  try {
    await verifyFileMatchesSnapshot(snapshotState, effectiveDirectories);
    const backupPath = await backupConfigTargetPlan(plan);
    let appliedFile: FileState | undefined;
    if (planState.desiredBytes) {
      await writeAtomicWithGuard(
        plan.targetPath,
        planState.desiredBytes,
        planState.desiredMode,
        async () => verifyFileMatchesSnapshot(snapshotState, effectiveDirectories),
        () => {
          committed = true;
        },
      );
      appliedFile = await requireExactFileState(
        plan.targetPath,
        snapshotState.descriptor,
        planState.desiredBytes,
        planState.desiredMode,
      );
    } else {
      await verifyFileMatchesSnapshot(snapshotState, effectiveDirectories);
      await unlink(plan.targetPath);
      committed = true;
      await syncDirectory(path.dirname(plan.targetPath));
      const current = await readOptionalRegularFile(
        plan.targetPath,
        snapshotState.descriptor.maxBytes,
        snapshotState.descriptor.label,
      );
      if (current) throw conflict();
    }
    application = Object.freeze({
      targetPath: plan.targetPath,
      changed: true,
      ...(backupPath ? { backupPath } : {}),
    });
    applicationStates.set(application, {
      plan,
      effectiveDirectories,
      createdDirectories,
      ...(appliedFile ? { appliedFile } : {}),
    });
    await options.afterCommit?.();
    return application;
  } catch (error) {
    if (committed) {
      const restoration = await restoreCaughtCommit(
        application,
        plan,
        planState,
        snapshotState,
        effectiveDirectories,
        createdDirectories,
      );
      if (!restoration.restored) {
        throw new AggregateError(
          [error, restoration.error],
          "Configuration apply failed after commit and safe restoration could not be completed.",
        );
      }
    } else {
      await removeCreatedDirectories(createdDirectories).catch(() => undefined);
    }
    throw error;
  }
}

async function restoreCaughtCommit(
  existingApplication: ConfigTargetApplication | undefined,
  plan: ConfigTargetPlan,
  planState: PlanState,
  snapshotState: SnapshotState,
  effectiveDirectories: readonly DirectoryIdentity[],
  createdDirectories: readonly DirectoryIdentity[],
): Promise<{ restored: true } | { restored: false; error: unknown }> {
  try {
    let application = existingApplication;
    if (!application) {
      let appliedFile: FileState | undefined;
      if (planState.desiredBytes) {
        appliedFile = await requireExactFileState(
          plan.targetPath,
          snapshotState.descriptor,
          planState.desiredBytes,
          planState.desiredMode,
        );
      } else {
        const current = await readOptionalRegularFile(
          plan.targetPath,
          snapshotState.descriptor.maxBytes,
          snapshotState.descriptor.label,
        );
        if (current) throw conflict("Configuration target changed after commit.");
      }
      application = Object.freeze({
        targetPath: plan.targetPath,
        changed: true,
        ...(planState.backupPath ? { backupPath: planState.backupPath } : {}),
      });
      applicationStates.set(application, {
        plan,
        effectiveDirectories: [...effectiveDirectories],
        createdDirectories: [...createdDirectories],
        ...(appliedFile ? { appliedFile } : {}),
      });
    }
    await restoreConfigTargetApplication(application);
    return { restored: true };
  } catch (error) {
    return { restored: false, error };
  }
}

export async function verifyConfigTargetPlan(plan: ConfigTargetPlan): Promise<void> {
  const state = requirePlanState(plan);
  const snapshotState = requireSnapshotState(state.snapshot);
  if (!state.desiredBytes && !plan.changed) {
    await revalidateConfigTargetSnapshot(state.snapshot);
    return;
  }
  const directories = await captureExistingParentDirectories(
    snapshotState.descriptor,
  );
  await verifyDirectories(directories);
  if (!state.desiredBytes) {
    const current = await readOptionalRegularFile(
      plan.targetPath,
      snapshotState.descriptor.maxBytes,
      snapshotState.descriptor.label,
    );
    if (current) {
      throw conflict("Configuration target does not match its exact desired state.");
    }
    return;
  }
  await requireExactFileState(
    plan.targetPath,
    snapshotState.descriptor,
    state.desiredBytes,
    state.desiredMode,
  );
}

export async function verifyConfigTargetApplication(
  application: ConfigTargetApplication,
): Promise<void> {
  const state = requireApplicationState(application);
  const planState = requirePlanState(state.plan);
  const snapshotState = requireSnapshotState(planState.snapshot);
  await verifyDirectories(state.effectiveDirectories);
  if (!state.appliedFile) {
    const current = await readOptionalRegularFile(
      application.targetPath,
      snapshotState.descriptor.maxBytes,
      snapshotState.descriptor.label,
    ).catch(() => {
      throw conflict();
    });
    if (current) throw conflict();
    return;
  }
  await verifyFileIdentityAndBytes(
    application.targetPath,
    snapshotState.descriptor,
    state.appliedFile,
  );
}

export async function restoreConfigTargetApplication(
  application: ConfigTargetApplication,
): Promise<void> {
  const applicationState = requireApplicationState(application);
  if (!application.changed) return;
  const planState = requirePlanState(applicationState.plan);
  const snapshotState = requireSnapshotState(planState.snapshot);
  await verifyConfigTargetApplication(application);

  if (snapshotState.file) {
    await writeAtomicWithGuard(
      application.targetPath,
      snapshotState.file.bytes,
      snapshotState.file.mode,
      async () => verifyConfigTargetApplication(application),
    );
    await requireExactFileState(
      application.targetPath,
      snapshotState.descriptor,
      snapshotState.file.bytes,
      snapshotState.file.mode,
    );
    return;
  }

  await verifyConfigTargetApplication(application);
  await unlink(application.targetPath);
  await syncDirectory(path.dirname(application.targetPath));
  const restored = await readOptionalRegularFile(
    application.targetPath,
    snapshotState.descriptor.maxBytes,
    snapshotState.descriptor.label,
  ).catch(() => {
    throw conflict("Configuration rollback could not restore absence.");
  });
  if (restored) throw conflict("Configuration rollback could not restore absence.");
  await removeCreatedDirectories(applicationState.createdDirectories);
}

export async function acquireConfigWriterLock(
  homeDirectory: string,
): Promise<ConfigWriterLock> {
  if (!path.isAbsolute(homeDirectory)) {
    throw new Error("Configuration writer lock home directory must be absolute.");
  }
  const root = path.resolve(homeDirectory);
  await requireDirectory(root, "Configuration writer lock home directory");
  const lockPath = path.join(root, ".side-glance.config.lock");
  const bytes = Buffer.from(
    `${JSON.stringify({ schema: 1, pid: process.pid, owner: randomUUID() })}\n`,
    "utf8",
  );
  let handle;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      handle = await open(
        lockPath,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      );
      break;
    } catch (error) {
      if (
        attempt === 0 &&
        hasCode(error, "EEXIST") &&
        (await recoverStaleWriterLock(lockPath))
      ) {
        continue;
      }
      if (hasCode(error, "EEXIST") || hasCode(error, "ELOOP")) {
        throw new Error("Another Side Glance configuration update is in progress.");
      }
      throw error;
    }
  }
  if (!handle) {
    throw new Error("Another Side Glance configuration update is in progress.");
  }
  try {
    await handle.writeFile(bytes);
    await handle.chmod(0o600);
    await handle.sync();
    const metadata = await handle.stat({ bigint: true });
    const lock = Object.freeze({ lockPath });
    lockStates.set(lock, {
      lockPath,
      bytes,
      device: metadata.dev,
      inode: metadata.ino,
      modifiedAtMs: Number(metadata.mtimeMs),
      released: false,
    });
    return lock;
  } finally {
    await handle.close();
  }
}

async function recoverStaleWriterLock(lockPath: string): Promise<boolean> {
  let captured: FileState;
  try {
    captured = await readRequiredRegularFile(
      lockPath,
      1_024,
      "Configuration writer lock",
    );
  } catch {
    return false;
  }
  let value: unknown;
  try {
    value = JSON.parse(captured.bytes.toString("utf8"));
  } catch {
    return recoverIncompleteWriterLock(lockPath, captured);
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("schema" in value) ||
    value.schema !== 1 ||
    !("pid" in value) ||
    typeof value.pid !== "number" ||
    !Number.isSafeInteger(value.pid) ||
    value.pid < 1 ||
    !("owner" in value) ||
    typeof value.owner !== "string" ||
    value.owner.length === 0
  ) {
    return recoverIncompleteWriterLock(lockPath, captured);
  }
  if (isProcessAlive(value.pid)) return false;
  return removeExpectedLockFile(lockPath, captured);
}

async function recoverIncompleteWriterLock(
  lockPath: string,
  captured: FileState,
): Promise<boolean> {
  if (Date.now() - captured.modifiedAtMs < INCOMPLETE_LOCK_RECOVERY_AGE_MS) {
    return false;
  }
  return removeExpectedLockFile(lockPath, captured);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !hasCode(error, "ESRCH");
  }
}

export async function releaseConfigWriterLock(lock: ConfigWriterLock): Promise<void> {
  const state = requireLockState(lock);
  if (state.released) return;
  const expected: FileState = {
    bytes: state.bytes,
    mode: 0o600,
    device: state.device,
    inode: state.inode,
    modifiedAtMs: state.modifiedAtMs,
  };
  const current = await readRequiredRegularFile(
    state.lockPath,
    1_024,
    "Configuration writer lock",
  ).catch(() => undefined);
  if (!current) {
    throw new Error("Side Glance configuration writer lock ownership was lost.");
  }
  if (
    current.device !== state.device ||
    current.inode !== state.inode ||
    !current.bytes.equals(state.bytes) ||
    !(await removeExpectedLockFile(state.lockPath, expected))
  ) {
    throw new Error("Side Glance configuration writer lock ownership was lost.");
  }
  state.released = true;
}

export async function withConfigWriterLock<T>(
  homeDirectory: string,
  operation: (lock: ConfigWriterLock) => Promise<T>,
): Promise<T> {
  const lock = await acquireConfigWriterLock(homeDirectory);
  let result: T | undefined;
  let operationError: unknown;
  try {
    result = await operation(lock);
  } catch (error) {
    operationError = error;
  }
  try {
    await releaseConfigWriterLock(lock);
  } catch {
    if (operationError !== undefined) throw operationError;
    // The operation already completed and verified. Do not turn an ownership-loss
    // cleanup warning into a false claim that configuration was rolled back.
  }
  if (operationError !== undefined) throw operationError;
  return result as T;
}

async function removeExpectedLockFile(
  lockPath: string,
  expected: FileState,
): Promise<boolean> {
  const quarantinePath = `${lockPath}.recovery-${randomUUID()}`;
  try {
    await rename(lockPath, quarantinePath);
  } catch {
    return false;
  }

  let moved: FileState | undefined;
  try {
    moved = await readRequiredRegularFile(
      quarantinePath,
      1_024,
      "Configuration writer lock",
    );
  } catch {
    await restoreQuarantinedLock(quarantinePath, lockPath).catch(() => undefined);
    return false;
  }
  if (!sameFileState(moved, expected)) {
    await restoreQuarantinedLock(quarantinePath, lockPath).catch(() => undefined);
    return false;
  }
  await unlink(quarantinePath);
  await syncDirectory(path.dirname(lockPath));
  return true;
}

async function restoreQuarantinedLock(
  quarantinePath: string,
  lockPath: string,
): Promise<void> {
  await link(quarantinePath, lockPath);
  await unlink(quarantinePath);
  await syncDirectory(path.dirname(lockPath));
}

function normalizeDescriptor(
  descriptor: ConfigTargetDescriptor,
): Required<ConfigTargetDescriptor> {
  if (!path.isAbsolute(descriptor.rootDirectory)) {
    throw new Error(`${descriptor.label} root directory must be absolute.`);
  }
  if (!path.isAbsolute(descriptor.targetPath)) {
    throw new Error(`${descriptor.label} path must be absolute.`);
  }
  if (!Number.isSafeInteger(descriptor.maxBytes) || descriptor.maxBytes < 1) {
    throw new Error(`${descriptor.label} byte limit must be a positive integer.`);
  }
  const rootDirectory = path.resolve(descriptor.rootDirectory);
  const targetPath = path.resolve(descriptor.targetPath);
  const relative = path.relative(rootDirectory, targetPath);
  if (
    relative.length === 0 ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${descriptor.label} path must stay inside its root directory.`);
  }
  const defaultMode = descriptor.defaultMode ?? 0o600;
  validateMode(defaultMode);
  return {
    ...descriptor,
    rootDirectory,
    targetPath,
    defaultMode,
  };
}

async function captureParentDirectories(
  rootDirectory: string,
  targetPath: string,
  label: string,
): Promise<{
  directories: DirectoryIdentity[];
  missingDirectories: string[];
}> {
  const relativeParent = path.relative(rootDirectory, path.dirname(targetPath));
  const components = relativeParent === "" ? [] : relativeParent.split(path.sep);
  const directories: DirectoryIdentity[] = [
    await captureDirectory(rootDirectory, `${label} root directory`),
  ];
  const missingDirectories: string[] = [];
  let current = rootDirectory;
  let missing = false;
  for (const component of components) {
    current = path.join(current, component);
    if (missing) {
      missingDirectories.push(current);
      continue;
    }
    try {
      directories.push(await captureDirectory(current, `${label} parent directory`));
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
      missing = true;
      missingDirectories.push(current);
    }
  }
  return { directories, missingDirectories };
}

async function captureExistingParentDirectories(
  descriptor: Required<ConfigTargetDescriptor>,
): Promise<DirectoryIdentity[]> {
  const captured = await captureParentDirectories(
    descriptor.rootDirectory,
    descriptor.targetPath,
    descriptor.label,
  );
  if (captured.missingDirectories.length > 0) throw conflict();
  return captured.directories;
}

async function captureDirectory(
  directoryPath: string,
  label: string,
): Promise<DirectoryIdentity> {
  const metadata = await lstat(directoryPath, { bigint: true });
  if (metadata.isSymbolicLink()) {
    throw new Error(`${label} may not be a symbolic link.`);
  }
  if (!metadata.isDirectory()) {
    throw new Error(`${label} must be a directory.`);
  }
  return { path: directoryPath, device: metadata.dev, inode: metadata.ino };
}

async function requireDirectory(directoryPath: string, label: string): Promise<void> {
  await captureDirectory(directoryPath, label);
}

async function verifyDirectories(directories: readonly DirectoryIdentity[]): Promise<void> {
  for (const expected of directories) {
    let current: DirectoryIdentity;
    try {
      current = await captureDirectory(expected.path, "Configuration parent directory");
    } catch {
      throw conflict("Configuration parent directory changed during update; no changes made.");
    }
    if (current.device !== expected.device || current.inode !== expected.inode) {
      throw conflict("Configuration parent directory changed during update; no changes made.");
    }
  }
}

async function verifyMissingDirectories(directories: readonly string[]): Promise<void> {
  for (const directory of directories) {
    try {
      await lstat(directory);
    } catch (error) {
      if (hasCode(error, "ENOENT")) continue;
      throw error;
    }
    throw conflict("Configuration parent directory changed during update; no changes made.");
  }
}

async function createMissingDirectories(
  snapshot: SnapshotState,
): Promise<DirectoryIdentity[]> {
  const created: DirectoryIdentity[] = [];
  try {
    for (const directory of snapshot.missingDirectories) {
      await mkdir(directory, { mode: 0o700 });
      created.push(await captureDirectory(directory, `${snapshot.descriptor.label} parent directory`));
    }
    return created;
  } catch (error) {
    await removeCreatedDirectories(created).catch(() => undefined);
    if (hasCode(error, "EEXIST") || hasCode(error, "ELOOP")) {
      throw conflict("Configuration parent directory changed during update; no changes made.");
    }
    throw error;
  }
}

async function removeCreatedDirectories(
  directories: readonly DirectoryIdentity[],
): Promise<void> {
  for (const directory of [...directories].reverse()) {
    const current = await captureDirectory(
      directory.path,
      "Transaction-created configuration directory",
    ).catch(() => {
      throw conflict("Transaction-created directory changed; rollback stopped safely.");
    });
    if (current.device !== directory.device || current.inode !== directory.inode) {
      throw conflict("Transaction-created directory changed; rollback stopped safely.");
    }
    if ((await readdir(directory.path)).length > 0) {
      throw conflict("Transaction-created directory is no longer empty; rollback stopped safely.");
    }
    await rmdir(directory.path);
  }
}

async function verifyFileMatchesSnapshot(
  snapshot: SnapshotState,
  effectiveDirectories: readonly DirectoryIdentity[],
): Promise<void> {
  await verifyDirectories(effectiveDirectories);
  const current = await readOptionalRegularFile(
    snapshot.descriptor.targetPath,
    snapshot.descriptor.maxBytes,
    snapshot.descriptor.label,
  ).catch(() => {
    throw conflict();
  });
  if (!snapshot.file) {
    if (current) throw conflict();
    return;
  }
  if (!current || !sameFileState(current, snapshot.file)) throw conflict();
}

async function verifyFileIdentityAndBytes(
  targetPath: string,
  descriptor: Required<ConfigTargetDescriptor>,
  expected: FileState,
): Promise<void> {
  const current = await readOptionalRegularFile(
    targetPath,
    descriptor.maxBytes,
    descriptor.label,
  ).catch(() => {
    throw conflict();
  });
  if (!current || !sameFileState(current, expected)) throw conflict();
}

async function requireExactFileState(
  targetPath: string,
  descriptor: Required<ConfigTargetDescriptor>,
  expectedBytes: Buffer,
  expectedMode: number,
): Promise<FileState> {
  const current = await readOptionalRegularFile(
    targetPath,
    descriptor.maxBytes,
    descriptor.label,
  );
  if (
    !current ||
    current.mode !== expectedMode ||
    !current.bytes.equals(expectedBytes)
  ) {
    throw conflict("Configuration target does not match its exact desired state.");
  }
  return current;
}

function sameFileState(left: FileState, right: FileState): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.mode === right.mode &&
    left.modifiedAtMs === right.modifiedAtMs &&
    left.bytes.equals(right.bytes)
  );
}

async function readOptionalRegularFile(
  targetPath: string,
  maxBytes: number,
  label: string,
): Promise<FileState | undefined> {
  try {
    return await readRequiredRegularFile(targetPath, maxBytes, label);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  }
}

async function readRequiredRegularFile(
  targetPath: string,
  maxBytes: number,
  label: string,
): Promise<FileState> {
  const pathMetadata = await lstat(targetPath, { bigint: true });
  if (pathMetadata.isSymbolicLink()) {
    throw new Error(`${label} may not be a symbolic link.`);
  }
  if (!pathMetadata.isFile()) {
    throw new Error(`${label} must be a regular file.`);
  }
  if (pathMetadata.size > BigInt(maxBytes)) {
    throw new Error(`${label} is too large to update safely.`);
  }
  const handle = await open(targetPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const openedMetadata = await handle.stat({ bigint: true });
    if (
      !openedMetadata.isFile() ||
      openedMetadata.dev !== pathMetadata.dev ||
      openedMetadata.ino !== pathMetadata.ino
    ) {
      throw conflict();
    }
    const bytes = Buffer.alloc(maxBytes + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        null,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > maxBytes) throw new Error(`${label} is too large to update safely.`);
    const finalMetadata = await handle.stat({ bigint: true });
    if (
      finalMetadata.dev !== openedMetadata.dev ||
      finalMetadata.ino !== openedMetadata.ino ||
      finalMetadata.size !== BigInt(offset)
    ) {
      throw conflict();
    }
    return {
      bytes: bytes.subarray(0, offset),
      mode: Number(finalMetadata.mode) & 0o777,
      device: finalMetadata.dev,
      inode: finalMetadata.ino,
      modifiedAtMs: Number(finalMetadata.mtimeMs),
    };
  } finally {
    await handle.close();
  }
}

async function writePrivateBackup(
  targetPath: string,
  bytes: Buffer,
): Promise<{ path: string; file: FileState }> {
  const backupPath = `${targetPath}.side-glance-backup-${Date.now()}-${randomUUID()}`;
  const handle = await open(
    backupPath,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.chmod(0o600);
    await handle.sync();
    await syncDirectory(path.dirname(backupPath));
    const metadata = await handle.stat({ bigint: true });
    return {
      path: backupPath,
      file: {
        bytes: Buffer.from(bytes),
        mode: Number(metadata.mode) & 0o777,
        device: metadata.dev,
        inode: metadata.ino,
        modifiedAtMs: Number(metadata.mtimeMs),
      },
    };
  } finally {
    await handle.close();
  }
}

async function writeAtomicWithGuard(
  targetPath: string,
  bytes: Buffer,
  mode: number,
  guard: () => Promise<void>,
  afterRename?: () => void,
): Promise<void> {
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await open(
      temporaryPath,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      mode,
    );
    await handle.writeFile(bytes);
    await handle.chmod(mode);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await guard();
    await rename(temporaryPath, targetPath);
    afterRename?.();
    await syncDirectory(path.dirname(targetPath));
  } finally {
    if (handle) await handle.close();
    await unlink(temporaryPath).catch((error: unknown) => {
      if (!hasCode(error, "ENOENT")) throw error;
    });
  }
}

async function syncDirectory(directoryPath: string): Promise<void> {
  const handle = await open(
    directoryPath,
    constants.O_RDONLY | (constants.O_DIRECTORY ?? 0),
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function validateMode(mode: number): void {
  if (!Number.isInteger(mode) || mode < 0 || mode > 0o777) {
    throw new Error("Configuration target mode must be a valid permission mode.");
  }
}

function requireSnapshotState(snapshot: ConfigTargetSnapshot): SnapshotState {
  const state = snapshotStates.get(snapshot);
  if (!state) throw new Error("Unknown configuration target snapshot.");
  return state;
}

function requirePlanState(plan: ConfigTargetPlan): PlanState {
  const state = planStates.get(plan);
  if (!state) throw new Error("Unknown configuration target plan.");
  return state;
}

function requireApplicationState(
  application: ConfigTargetApplication,
): ApplicationState {
  const state = applicationStates.get(application);
  if (!state) throw new Error("Unknown configuration target application.");
  return state;
}

function requireLockState(lock: ConfigWriterLock): LockState {
  const state = lockStates.get(lock);
  if (!state) throw new Error("Unknown configuration writer lock.");
  return state;
}

function conflict(message?: string): ConfigTargetConflictError {
  return new ConfigTargetConflictError(message);
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
