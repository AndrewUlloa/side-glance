import assert from "node:assert/strict";
import test from "node:test";

import {
  applySetupTransaction,
  SetupTransactionError,
  type SetupTransactionParticipant,
} from "../../src/cli/setup-transaction.ts";

interface FixtureOptions {
  changed?: boolean;
  failAt?: "revalidate" | "backup" | "apply" | "verify" | "rollback";
  rollbackStatus?: "restored" | "conflict";
  afterApply?: () => void;
  backupAfterApply?: string;
  preCommit?: () => void | Promise<void>;
}

function participant(
  id: string,
  operations: string[],
  options: FixtureOptions = {},
): SetupTransactionParticipant<string> {
  const changed = options.changed ?? true;
  return {
    id,
    configPath: `/private/${id}.json`,
    changed,
    async revalidate() {
      operations.push(`${id}:revalidate`);
      if (options.failAt === "revalidate") throw new Error("HOSTILE_REVALIDATE");
    },
    async backup() {
      operations.push(`${id}:backup`);
      if (options.failAt === "backup") throw new Error("HOSTILE_BACKUP");
      return `/private/${id}.backup`;
    },
    ...(options.preCommit
      ? {
          async preCommit() {
            operations.push(`${id}:pre-commit`);
            await options.preCommit?.();
          },
        }
      : {}),
    async apply() {
      operations.push(`${id}:apply`);
      if (options.failAt === "apply") throw new Error("HOSTILE_APPLY");
      options.afterApply?.();
      return `${id}:token`;
    },
    ...(options.backupAfterApply
      ? { backupPath: () => options.backupAfterApply }
      : {}),
    async verify() {
      operations.push(`${id}:verify`);
      if (options.failAt === "verify") throw new Error("HOSTILE_VERIFY");
    },
    async rollback(token) {
      operations.push(`${id}:rollback:${token}`);
      if (options.failAt === "rollback") throw new Error("HOSTILE_ROLLBACK");
      return options.rollbackStatus ?? "restored";
    },
  };
}

test("revalidates the whole approved plan before applying and verifies after all writes", async () => {
  const operations: string[] = [];
  const result = await applySetupTransaction(
    [participant("claude", operations), participant("codex", operations)],
    {
      withLock: async (operation) => {
        operations.push("lock:acquire");
        try {
          return await operation();
        } finally {
          operations.push("lock:release");
        }
      },
    },
  );

  assert.deepEqual(operations, [
    "lock:acquire",
    "claude:revalidate",
    "codex:revalidate",
    "claude:backup",
    "claude:apply",
    "codex:backup",
    "codex:apply",
    "claude:verify",
    "codex:verify",
    "lock:release",
  ]);
  assert.deepEqual(result.providers, [
    {
      id: "claude",
      configPath: "/private/claude.json",
      changed: true,
      backupPath: "/private/claude.backup",
    },
    {
      id: "codex",
      configPath: "/private/codex.json",
      changed: true,
      backupPath: "/private/codex.backup",
    },
  ]);
});

test("can project a backup path produced atomically during apply", async () => {
  const operations: string[] = [];
  const result = await applySetupTransaction(
    [
      participant("claude", operations, {
        backupAfterApply: "/private/atomic.backup",
      }),
    ],
    { withLock: (operation) => operation() },
  );

  assert.equal(result.providers[0]?.backupPath, "/private/atomic.backup");
});

test("runs the durable executable preflight after plan revalidation and before writes", async () => {
  const operations: string[] = [];

  await applySetupTransaction([participant("claude", operations)], {
    withLock: (operation) => operation(),
    preApply: async () => {
      operations.push("executable:revalidate");
    },
  });

  assert.deepEqual(operations, [
    "claude:revalidate",
    "executable:revalidate",
    "claude:backup",
    "claude:apply",
    "claude:verify",
  ]);
});

test("runs each participant pre-commit check immediately before its apply", async () => {
  const operations: string[] = [];

  await applySetupTransaction(
    [
      participant("claude", operations, {
        preCommit: () => {
          operations.push("claude:identity-current");
        },
      }),
    ],
    { withLock: (operation) => operation() },
  );

  assert.deepEqual(operations, [
    "claude:revalidate",
    "claude:backup",
    "claude:pre-commit",
    "claude:identity-current",
    "claude:apply",
    "claude:verify",
  ]);
});

test("does not back up or apply unchanged participants but still verifies them", async () => {
  const operations: string[] = [];
  const result = await applySetupTransaction(
    [participant("claude", operations, { changed: false })],
    { withLock: (operation) => operation() },
  );

  assert.deepEqual(operations, ["claude:revalidate", "claude:verify"]);
  assert.deepEqual(result.providers, [
    { id: "claude", configPath: "/private/claude.json", changed: false },
  ]);
});

test("rolls back earlier writes in reverse order after a caught apply failure", async () => {
  const operations: string[] = [];

  await assert.rejects(
    () =>
      applySetupTransaction(
        [
          participant("claude", operations),
          participant("codex", operations),
          participant("gemini", operations, { failAt: "apply" }),
        ],
        { withLock: (operation) => operation() },
      ),
    (error: unknown) => {
      assert.ok(error instanceof SetupTransactionError);
      assert.equal(error.code, "apply-failed");
      assert.doesNotMatch(error.message, /HOSTILE/u);
      assert.deepEqual(error.rollback, [
        { id: "codex", configPath: "/private/codex.json", status: "restored" },
        { id: "claude", configPath: "/private/claude.json", status: "restored" },
      ]);
      return true;
    },
  );
  assert.deepEqual(operations.slice(-2), [
    "codex:rollback:codex:token",
    "claude:rollback:claude:token",
  ]);
});

test("reports rollback conflicts distinctly and never retries over an external edit", async () => {
  const operations: string[] = [];

  await assert.rejects(
    () =>
      applySetupTransaction(
        [
          participant("claude", operations, { rollbackStatus: "conflict" }),
          participant("codex", operations, { failAt: "verify" }),
        ],
        { withLock: (operation) => operation() },
      ),
    (error: unknown) => {
      assert.ok(error instanceof SetupTransactionError);
      assert.equal(error.code, "rollback-conflict");
      assert.deepEqual(error.rollback, [
        { id: "codex", configPath: "/private/codex.json", status: "restored" },
        { id: "claude", configPath: "/private/claude.json", status: "conflict" },
      ]);
      return true;
    },
  );
  assert.equal(
    operations.filter((operation) => operation.startsWith("claude:rollback")).length,
    1,
  );
});

test("aborting during apply becomes a caught interruption and rolls back", async () => {
  const controller = new AbortController();
  const operations: string[] = [];

  await assert.rejects(
    () =>
      applySetupTransaction(
        [
          participant("claude", operations, {
            afterApply: () => controller.abort(),
          }),
          participant("codex", operations),
        ],
        { withLock: (operation) => operation(), signal: controller.signal },
      ),
    (error: unknown) => {
      assert.ok(error instanceof SetupTransactionError);
      assert.equal(error.code, "interrupted");
      assert.deepEqual(error.rollback, [
        { id: "claude", configPath: "/private/claude.json", status: "restored" },
      ]);
      return true;
    },
  );
  assert.ok(!operations.includes("codex:backup"));
  assert.ok(!operations.includes("codex:apply"));
});
