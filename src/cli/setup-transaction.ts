export type SetupRollbackStatus = "restored" | "conflict" | "failed";

export interface SetupRollbackResult {
  id: string;
  configPath: string;
  status: SetupRollbackStatus;
}

export interface SetupTransactionParticipant<Token = unknown> {
  id: string;
  configPath: string;
  changed: boolean;
  revalidate(): Promise<void>;
  backup(): Promise<string | undefined>;
  preCommit?(): Promise<void>;
  apply(): Promise<Token>;
  backupPath?(token: Token): string | undefined;
  verify(): Promise<void>;
  rollback(token: Token): Promise<"restored" | "conflict">;
}

export interface SetupTransactionOptions {
  withLock<Result>(operation: () => Promise<Result>): Promise<Result>;
  preApply?(): Promise<void>;
  signal?: AbortSignal;
}

export interface SetupTransactionProviderResult {
  id: string;
  configPath: string;
  changed: boolean;
  backupPath?: string;
}

export interface SetupTransactionResult {
  providers: SetupTransactionProviderResult[];
}

export type SetupTransactionErrorCode =
  | "plan-changed"
  | "backup-failed"
  | "apply-failed"
  | "verification-failed"
  | "interrupted"
  | "rollback-conflict"
  | "rollback-failed"
  | "lock-failed";

const ERROR_MESSAGES: Readonly<Record<SetupTransactionErrorCode, string>> = {
  "plan-changed":
    "The approved setup plan changed before it could be applied. Run setup again.",
  "backup-failed":
    "Setup could not create a protected backup. No further changes were applied.",
  "apply-failed": "Setup could not apply the approved provider changes.",
  "verification-failed":
    "Setup could not verify the final provider configuration.",
  interrupted: "Setup was interrupted and its completed changes were rolled back.",
  "rollback-conflict":
    "Setup stopped without overwriting a configuration changed by another process.",
  "rollback-failed":
    "Setup could not restore every provider configuration automatically.",
  "lock-failed": "Setup could not acquire its provider configuration lock.",
};

export class SetupTransactionError extends Error {
  readonly code: SetupTransactionErrorCode;
  readonly rollback: readonly SetupRollbackResult[];

  constructor(
    code: SetupTransactionErrorCode,
    rollback: readonly SetupRollbackResult[] = [],
    options?: ErrorOptions,
  ) {
    super(ERROR_MESSAGES[code], options);
    this.name = "SetupTransactionError";
    this.code = code;
    this.rollback = rollback;
  }
}

class SetupInterruptedError extends Error {}

interface AppliedParticipant {
  participant: SetupTransactionParticipant<unknown>;
  token: unknown;
}

export async function applySetupTransaction(
  participants: readonly SetupTransactionParticipant<unknown>[],
  options: SetupTransactionOptions,
): Promise<SetupTransactionResult> {
  let enteredLock = false;
  try {
    return await options.withLock(async () => {
      enteredLock = true;
      return await applyWhileLocked(
        participants,
        options.preApply,
        options.signal,
      );
    });
  } catch (error) {
    if (error instanceof SetupTransactionError) throw error;
    throw new SetupTransactionError(
      enteredLock ? "apply-failed" : "lock-failed",
      [],
      { cause: error },
    );
  }
}

async function applyWhileLocked(
  participants: readonly SetupTransactionParticipant<unknown>[],
  preApply: (() => Promise<void>) | undefined,
  signal: AbortSignal | undefined,
): Promise<SetupTransactionResult> {
  const applied: AppliedParticipant[] = [];
  const results: SetupTransactionProviderResult[] = [];
  let phase: "revalidate" | "backup" | "precommit" | "apply" | "verify" =
    "revalidate";

  try {
    assertNotAborted(signal);
    for (const participant of participants) {
      await participant.revalidate();
      assertNotAborted(signal);
    }
    await preApply?.();
    assertNotAborted(signal);

    for (const participant of participants) {
      if (!participant.changed) {
        results.push(providerResult(participant));
        continue;
      }

      assertNotAborted(signal);
      phase = "backup";
      const backupPath = await participant.backup();
      assertNotAborted(signal);
      phase = "precommit";
      await participant.preCommit?.();
      assertNotAborted(signal);
      phase = "apply";
      const token = await participant.apply();
      applied.push({ participant, token });
      results.push(
        providerResult(
          participant,
          participant.backupPath?.(token) ?? backupPath,
        ),
      );
    }

    phase = "verify";
    for (const participant of participants) {
      assertNotAborted(signal);
      await participant.verify();
    }
    assertNotAborted(signal);

    return { providers: results };
  } catch (error) {
    const rollback = await rollbackApplied(applied);
    const rollbackCode = rollbackFailureCode(rollback);
    const code =
      rollbackCode ??
      (error instanceof SetupInterruptedError
        ? "interrupted"
        : errorCodeForPhase(phase));
    throw new SetupTransactionError(code, rollback, { cause: error });
  }
}

function providerResult(
  participant: SetupTransactionParticipant<unknown>,
  backupPath?: string,
): SetupTransactionProviderResult {
  return {
    id: participant.id,
    configPath: participant.configPath,
    changed: participant.changed,
    ...(backupPath === undefined ? {} : { backupPath }),
  };
}

async function rollbackApplied(
  applied: readonly AppliedParticipant[],
): Promise<SetupRollbackResult[]> {
  const results: SetupRollbackResult[] = [];
  for (const { participant, token } of applied.toReversed()) {
    try {
      results.push({
        id: participant.id,
        configPath: participant.configPath,
        status: await participant.rollback(token),
      });
    } catch {
      results.push({
        id: participant.id,
        configPath: participant.configPath,
        status: "failed",
      });
    }
  }
  return results;
}

function rollbackFailureCode(
  rollback: readonly SetupRollbackResult[],
): "rollback-conflict" | "rollback-failed" | undefined {
  if (rollback.some(({ status }) => status === "failed")) {
    return "rollback-failed";
  }
  if (rollback.some(({ status }) => status === "conflict")) {
    return "rollback-conflict";
  }
  return undefined;
}

function errorCodeForPhase(
  phase: "revalidate" | "backup" | "precommit" | "apply" | "verify",
): SetupTransactionErrorCode {
  if (phase === "revalidate" || phase === "precommit") return "plan-changed";
  if (phase === "backup") return "backup-failed";
  if (phase === "verify") return "verification-failed";
  return "apply-failed";
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new SetupInterruptedError();
}
