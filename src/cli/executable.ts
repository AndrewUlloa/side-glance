import { execFile } from "node:child_process";
import { constants, type Stats } from "node:fs";
import {
  access as accessFile,
  lstat as lstatFile,
  realpath as resolveRealPath,
  stat as statFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_PROBE_TIMEOUT_MS = 2_000;
const DEFAULT_MAX_PROBE_BYTES = 256;
const CONTROL_CHARACTER = /\p{Cc}/u;
const NPX_PATH_SEGMENT = /(?:^|[/\\])_npx(?:[/\\]|$)/u;
const HOMEBREW_CELLAR_SIDE_GLANCE =
  /(?:^|[/\\])Cellar[/\\]side-glance(?:[/\\]|$)/u;
const NPM_EXEC_ENVIRONMENT_KEYS = new Set([
  "npm_command",
  "npm_execpath",
  "npm_lifecycle_event",
  "npm_lifecycle_script",
  "npm_node_execpath",
]);

export interface ExecutableMetadata {
  readonly dev: number | bigint;
  readonly ino: number | bigint;
  readonly mode: number | bigint;
  readonly size: number | bigint;
  readonly mtimeMs: number;
  readonly ctimeMs: number;
  isFile(): boolean;
  isSymbolicLink?(): boolean;
}

export interface ExecutableFileSystem {
  access(filePath: string, mode: number): Promise<void>;
  lstat(filePath: string): Promise<ExecutableMetadata>;
  realpath(filePath: string): Promise<string>;
  stat(filePath: string): Promise<ExecutableMetadata>;
}

export interface ExecutableFileIdentity {
  readonly device: string;
  readonly inode: string;
  readonly mode: string;
  readonly size: string;
  readonly modifiedAt: number;
  readonly changedAt: number;
  readonly kind: "file" | "symlink" | "other";
}

export interface ExecutableIdentityToken {
  readonly invocationPath: string;
  readonly realPath: string;
  readonly invocation: ExecutableFileIdentity;
  readonly target: ExecutableFileIdentity;
}

export interface VersionProbeBounds {
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}

export interface VersionProbeResult {
  readonly exitCode: number | null;
  readonly stdout: string | Uint8Array;
  readonly timedOut?: boolean;
  readonly outputExceeded?: boolean;
}

export type VersionProbe = (
  executablePath: string,
  args: readonly string[],
  bounds: VersionProbeBounds,
) => Promise<VersionProbeResult>;

export interface ValidatedDurableExecutable {
  readonly invocationPath: string;
  readonly realPath: string;
  readonly version: string;
  readonly identity: ExecutableIdentityToken;
}

export interface DetectEphemeralNpmExecutionOptions {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly invocationPath?: string;
  readonly realPath?: string;
  readonly cwd?: string;
}

export interface ValidateDurableExecutableOptions {
  readonly invocationPath: string;
  readonly expectedVersion: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly currentRunnerIdentity?: ExecutableIdentityToken;
  readonly probeVersion?: VersionProbe;
  readonly probeTimeoutMs?: number;
  readonly maxProbeBytes?: number;
  readonly fileSystem?: ExecutableFileSystem;
  readonly cwd?: string;
}

export interface FindDurableExecutableOptions
  extends Omit<ValidateDurableExecutableOptions, "invocationPath"> {
  readonly commandName?: string;
}

export class ExecutableValidationError extends Error {
  readonly code:
    | "invalid-path"
    | "not-executable"
    | "ephemeral"
    | "current-runner"
    | "probe-failed"
    | "identity-changed";

  constructor(
    code:
      | "invalid-path"
      | "not-executable"
      | "ephemeral"
      | "current-runner"
      | "probe-failed"
      | "identity-changed",
    message: string,
  ) {
    super(message);
    this.name = "ExecutableValidationError";
    this.code = code;
  }
}

const defaultFileSystem: ExecutableFileSystem = {
  access: accessFile,
  lstat: lstatFile as (filePath: string) => Promise<Stats>,
  realpath: resolveRealPath,
  stat: statFile as (filePath: string) => Promise<Stats>,
};

export function detectEphemeralNpmExecution(
  options: DetectEphemeralNpmExecutionOptions,
): boolean {
  const lifecycleEvent = environmentValue(
    options.environment,
    "npm_lifecycle_event",
  );
  const npmCommand = environmentValue(options.environment, "npm_command");
  if (lifecycleEvent?.toLowerCase() === "npx") return true;
  if (npmCommand?.toLowerCase() === "exec") return true;

  const cacheDirectories = configuredNpmCacheDirectories(
    options.environment,
    options.cwd,
  );
  return [options.invocationPath, options.realPath].some(
    (candidate) =>
      candidate !== undefined &&
      (NPX_PATH_SEGMENT.test(candidate) ||
        cacheDirectories.some((directory) => isPathWithin(directory, candidate))),
  );
}

export async function captureExecutableIdentity(
  invocationPath: string,
  fileSystem: ExecutableFileSystem = defaultFileSystem,
): Promise<ExecutableIdentityToken> {
  validateInvocationPath(invocationPath);
  try {
    const [invocationMetadata, followedMetadata] = await Promise.all([
      fileSystem.lstat(invocationPath),
      fileSystem.stat(invocationPath),
      fileSystem.access(invocationPath, constants.X_OK),
    ]);
    if (!followedMetadata.isFile()) throw new Error("not a file");
    const realPath = await fileSystem.realpath(invocationPath);
    validateResolvedPath(realPath);
    const targetMetadata = await fileSystem.stat(realPath);
    if (!targetMetadata.isFile()) throw new Error("not a file");
    return {
      invocationPath,
      realPath,
      invocation: metadataIdentity(invocationMetadata),
      target: metadataIdentity(targetMetadata),
    };
  } catch (error) {
    if (error instanceof ExecutableValidationError) throw error;
    throw new ExecutableValidationError(
      "not-executable",
      "The durable executable candidate is not a regular executable.",
    );
  }
}

export async function validateDurableExecutable(
  options: ValidateDurableExecutableOptions,
): Promise<ValidatedDurableExecutable> {
  validateInvocationPath(options.invocationPath);
  if (
    detectEphemeralNpmExecution({
      environment: options.environment,
      invocationPath: options.invocationPath,
      cwd: options.cwd,
    })
  ) {
    throw ephemeralExecutableError();
  }

  const fileSystem = options.fileSystem ?? defaultFileSystem;
  const identity = await captureExecutableIdentity(
    options.invocationPath,
    fileSystem,
  );
  if (
    detectEphemeralNpmExecution({
      environment: options.environment,
      invocationPath: identity.invocationPath,
      realPath: identity.realPath,
      cwd: options.cwd,
    }) ||
    (await isPathWithinConfiguredNpmCache(
      identity.realPath,
      options.environment,
      fileSystem,
      options.cwd,
    ))
  ) {
    throw ephemeralExecutableError();
  }
  if (
    options.currentRunnerIdentity &&
    sameExecutableIdentity(identity, options.currentRunnerIdentity)
  ) {
    throw new ExecutableValidationError(
      "current-runner",
      "The durable executable candidate resolves to the current temporary runner.",
    );
  }

  const bounds = validatedProbeBounds(options);
  const probe =
    options.probeVersion ??
    defaultVersionProbe(sanitizeDelegatedEnvironment(options.environment));
  const result = await invokeBoundedProbe(
    probe,
    identity.invocationPath,
    bounds,
  );
  validateVersionProbeResult(result, options.expectedVersion, bounds);

  return {
    invocationPath: identity.invocationPath,
    realPath: identity.realPath,
    version: options.expectedVersion,
    identity,
  };
}

export async function findDurableExecutableOnPath(
  options: FindDurableExecutableOptions,
): Promise<ValidatedDurableExecutable | undefined> {
  const commandName = options.commandName ?? "side-glance";
  if (
    commandName.length === 0 ||
    commandName.includes("/") ||
    commandName.includes("\\") ||
    CONTROL_CHARACTER.test(commandName)
  ) {
    throw new ExecutableValidationError(
      "invalid-path",
      "The executable command name is invalid.",
    );
  }
  const cwd = options.cwd ?? process.cwd();
  const visited = new Set<string>();
  for (const directory of (options.environment.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    const invocationPath = path.resolve(cwd, directory, commandName);
    if (visited.has(invocationPath)) continue;
    visited.add(invocationPath);
    if (HOMEBREW_CELLAR_SIDE_GLANCE.test(invocationPath)) continue;
    try {
      return await validateDurableExecutable({
        ...options,
        cwd,
        invocationPath,
      });
    } catch {
      // A rejected PATH shadow must not hide a later durable executable.
    }
  }
  return undefined;
}

export async function revalidateExecutableIdentity(
  executable: ValidatedDurableExecutable | ExecutableIdentityToken,
  options: {
    readonly environment?: Readonly<Record<string, string | undefined>>;
    readonly fileSystem?: ExecutableFileSystem;
    readonly cwd?: string;
  } = {},
): Promise<void> {
  const expected = "identity" in executable ? executable.identity : executable;
  let actual: ExecutableIdentityToken;
  try {
    actual = await captureExecutableIdentity(
      expected.invocationPath,
      options.fileSystem ?? defaultFileSystem,
    );
  } catch {
    throw identityChangedError();
  }
  if (
    detectEphemeralNpmExecution({
      environment: options.environment ?? {},
      invocationPath: actual.invocationPath,
      realPath: actual.realPath,
      cwd: options.cwd,
    }) ||
    (await isPathWithinConfiguredNpmCache(
      actual.realPath,
      options.environment ?? {},
      options.fileSystem ?? defaultFileSystem,
      options.cwd,
    )) ||
    !sameIdentityToken(actual, expected)
  ) {
    throw identityChangedError();
  }
}

export function sanitizeDelegatedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  cwd = process.cwd(),
): Record<string, string | undefined> {
  const cacheDirectories = configuredNpmCacheDirectories(environment, cwd);
  const sanitized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(environment)) {
    if (NPM_EXEC_ENVIRONMENT_KEYS.has(key.toLowerCase())) continue;
    sanitized[key] = value;
  }
  if (environment.PATH !== undefined) {
    sanitized.PATH = environment.PATH
      .split(path.delimiter)
      .filter(
        (directory) =>
          directory.length > 0 &&
          !NPX_PATH_SEGMENT.test(directory) &&
          !cacheDirectories.some((cache) => isPathWithin(cache, directory)),
      )
      .join(path.delimiter);
  }
  return sanitized;
}

function validateInvocationPath(invocationPath: string): void {
  if (!path.isAbsolute(invocationPath)) {
    throw new ExecutableValidationError(
      "invalid-path",
      "The durable executable invocation path must be absolute.",
    );
  }
  if (CONTROL_CHARACTER.test(invocationPath)) {
    throw new ExecutableValidationError(
      "invalid-path",
      "The durable executable invocation path contains a control character.",
    );
  }
}

function validateResolvedPath(realPath: string): void {
  if (!path.isAbsolute(realPath) || CONTROL_CHARACTER.test(realPath)) {
    throw new ExecutableValidationError(
      "invalid-path",
      "The resolved durable executable path is invalid.",
    );
  }
}

function metadataIdentity(metadata: ExecutableMetadata): ExecutableFileIdentity {
  return {
    device: String(metadata.dev),
    inode: String(metadata.ino),
    mode: String(metadata.mode),
    size: String(metadata.size),
    modifiedAt: metadata.mtimeMs,
    changedAt: metadata.ctimeMs,
    kind: metadata.isSymbolicLink?.()
      ? "symlink"
      : metadata.isFile()
        ? "file"
        : "other",
  };
}

function sameExecutableIdentity(
  left: ExecutableIdentityToken,
  right: ExecutableIdentityToken,
): boolean {
  return (
    sameNormalizedPath(left.invocationPath, right.invocationPath) ||
    sameNormalizedPath(left.invocationPath, right.realPath) ||
    sameNormalizedPath(left.realPath, right.invocationPath) ||
    sameNormalizedPath(left.realPath, right.realPath) ||
    sameFile(left.target, right.target)
  );
}

function sameIdentityToken(
  left: ExecutableIdentityToken,
  right: ExecutableIdentityToken,
): boolean {
  return (
    left.invocationPath === right.invocationPath &&
    left.realPath === right.realPath &&
    sameFileIdentity(left.invocation, right.invocation) &&
    sameFileIdentity(left.target, right.target)
  );
}

function sameFileIdentity(
  left: ExecutableFileIdentity,
  right: ExecutableFileIdentity,
): boolean {
  return (
    sameFile(left, right) &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.modifiedAt === right.modifiedAt &&
    left.changedAt === right.changedAt &&
    left.kind === right.kind
  );
}

function sameFile(
  left: ExecutableFileIdentity,
  right: ExecutableFileIdentity,
): boolean {
  return left.device === right.device && left.inode === right.inode;
}

function sameNormalizedPath(left: string, right: string): boolean {
  return path.normalize(left) === path.normalize(right);
}

function configuredNpmCacheDirectories(
  environment: Readonly<Record<string, string | undefined>>,
  cwd = process.cwd(),
): string[] {
  const directories = new Set<string>();
  for (const [key, value] of Object.entries(environment)) {
    if (key.toLowerCase() !== "npm_config_cache" || !value) continue;
    if (CONTROL_CHARACTER.test(value)) continue;
    directories.add(path.resolve(cwd, value));
  }
  return [...directories];
}

export async function isPathWithinConfiguredNpmCache(
  candidate: string,
  environment: Readonly<Record<string, string | undefined>>,
  fileSystem: ExecutableFileSystem = defaultFileSystem,
  cwd = process.cwd(),
): Promise<boolean> {
  for (const directory of configuredNpmCacheDirectories(environment, cwd)) {
    let resolvedDirectory = directory;
    try {
      resolvedDirectory = await fileSystem.realpath(directory);
    } catch {
      // A missing cache root cannot contain a resolved executable candidate.
    }
    if (isPathWithin(resolvedDirectory, candidate)) return true;
  }
  return false;
}

function environmentValue(
  environment: Readonly<Record<string, string | undefined>>,
  requestedKey: string,
): string | undefined {
  const entry = Object.entries(environment).find(
    ([key]) => key.toLowerCase() === requestedKey,
  );
  return entry?.[1];
}

function isPathWithin(directory: string, candidate: string): boolean {
  if (!path.isAbsolute(candidate) || CONTROL_CHARACTER.test(candidate)) {
    return false;
  }
  const relative = path.relative(path.resolve(directory), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validatedProbeBounds(
  options: ValidateDurableExecutableOptions,
): VersionProbeBounds {
  const timeoutMs = options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const maxOutputBytes = options.maxProbeBytes ?? DEFAULT_MAX_PROBE_BYTES;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new ExecutableValidationError(
      "probe-failed",
      "The executable version probe bounds are invalid.",
    );
  }
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    throw new ExecutableValidationError(
      "probe-failed",
      "The executable version probe bounds are invalid.",
    );
  }
  return { timeoutMs, maxOutputBytes };
}

async function invokeBoundedProbe(
  probe: VersionProbe,
  executablePath: string,
  bounds: VersionProbeBounds,
): Promise<VersionProbeResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      probe(executablePath, ["--version"], bounds),
      new Promise<VersionProbeResult>((resolve) => {
        timeout = setTimeout(
          () => resolve({ exitCode: null, stdout: "", timedOut: true }),
          bounds.timeoutMs,
        );
      }),
    ]);
  } catch {
    throw new ExecutableValidationError(
      "probe-failed",
      "The durable executable version probe failed.",
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function validateVersionProbeResult(
  result: VersionProbeResult,
  expectedVersion: string,
  bounds: VersionProbeBounds,
): void {
  if (result.timedOut) {
    throw new ExecutableValidationError(
      "probe-failed",
      "The durable executable version probe timed out.",
    );
  }
  if (result.outputExceeded) {
    throw new ExecutableValidationError(
      "probe-failed",
      "The durable executable version output exceeded the safety limit.",
    );
  }
  const byteLength =
    typeof result.stdout === "string"
      ? Buffer.byteLength(result.stdout)
      : result.stdout.byteLength;
  if (byteLength > bounds.maxOutputBytes) {
    throw new ExecutableValidationError(
      "probe-failed",
      "The durable executable version output exceeded the safety limit.",
    );
  }
  if (result.exitCode !== 0) {
    throw new ExecutableValidationError(
      "probe-failed",
      "The durable executable version probe did not exit successfully.",
    );
  }

  let output: string;
  try {
    output =
      typeof result.stdout === "string"
        ? result.stdout
        : new TextDecoder("utf-8", { fatal: true }).decode(result.stdout);
  } catch {
    throw new ExecutableValidationError(
      "probe-failed",
      "The durable executable version output was malformed.",
    );
  }
  if (
    output !== expectedVersion &&
    output !== `${expectedVersion}\n` &&
    output !== `${expectedVersion}\r\n`
  ) {
    throw new ExecutableValidationError(
      "probe-failed",
      "The durable executable did not report the expected Side Glance version.",
    );
  }
}

function defaultVersionProbe(
  environment: Readonly<Record<string, string | undefined>>,
): VersionProbe {
  return async (executablePath, args, bounds) => {
    try {
      const { stdout } = await execFileAsync(executablePath, [...args], {
        encoding: "utf8",
        env: environment as NodeJS.ProcessEnv,
        maxBuffer: bounds.maxOutputBytes,
        shell: false,
        timeout: bounds.timeoutMs,
        windowsHide: true,
      });
      return { exitCode: 0, stdout };
    } catch (error) {
      const result = error as {
        readonly code?: number | string;
        readonly killed?: boolean;
        readonly signal?: string;
      };
      return {
        exitCode: typeof result.code === "number" ? result.code : null,
        stdout: "",
        ...(result.killed && result.signal ? { timedOut: true } : {}),
        ...(result.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
          ? { outputExceeded: true }
          : {}),
      };
    }
  };
}

function ephemeralExecutableError(): ExecutableValidationError {
  return new ExecutableValidationError(
    "ephemeral",
    "The executable candidate belongs to temporary npm execution and cannot be retained by provider hooks.",
  );
}

function identityChangedError(): ExecutableValidationError {
  return new ExecutableValidationError(
    "identity-changed",
    "The validated executable identity changed before configuration could be applied.",
  );
}
