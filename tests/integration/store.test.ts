import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { FileSideGlanceStore } from "../../src/core/store.ts";

const workerPath = fileURLToPath(
  new URL("../fixtures/store-writer.ts", import.meta.url),
);

async function temporaryDirectory(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "side-glance-store-"));
}

async function runWriter(
  directory: string,
  writerId: string,
  count: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [workerPath, directory, writerId, String(count)],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Writer exited ${code ?? signal}: ${stderr}`));
    });
  });
}

test("serializes concurrent processes without losing events", async (context) => {
  const directory = await temporaryDirectory();
  context.after(() => rm(directory, { recursive: true, force: true }));

  await Promise.all(
    ["alpha", "bravo", "charlie", "delta"].map((writerId) =>
      runWriter(directory, writerId, 8),
    ),
  );

  const state = await new FileSideGlanceStore({ directory }).read();
  assert.equal(Object.keys(state.sessions).length, 4);
  assert.equal(state.seenEventIds.length, 32);
  assert.ok(
    Object.values(state.sessions).every((session) => session.generation === 8),
  );
});

test("writes private state atomically and quarantines malformed state", async (context) => {
  const directory = await temporaryDirectory();
  context.after(() => rm(directory, { recursive: true, force: true }));
  const store = new FileSideGlanceStore({ directory });

  await store.update((state) => state);

  const statePath = path.join(directory, "side-glance-state.json");
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(statePath)).mode & 0o777, 0o600);
  assert.deepEqual(
    (await readdir(directory)).filter((name) => name.includes(".tmp")),
    [],
  );

  await writeFile(statePath, '{"schemaVersion":0,"prompt":"do not evaluate"}', {
    mode: 0o600,
  });
  await chmod(statePath, 0o600);

  const reset = await store.read();
  assert.deepEqual(reset, {
    schemaVersion: 1,
    sessions: {},
    surfaces: {},
    seenEventIds: [],
  });

  const files = await readdir(directory);
  assert.ok(files.some((name) => name.startsWith("side-glance-state.corrupt-")));
  const persistedReset = await readFile(statePath, "utf8");
  assert.doesNotThrow(() => JSON.parse(persistedReset));
});

test("quarantines non-numeric adaptive timing history", async (context) => {
  const directory = await temporaryDirectory();
  context.after(() => rm(directory, { recursive: true, force: true }));
  const statePath = path.join(directory, "side-glance-state.json");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(
    statePath,
    `${JSON.stringify({
      schemaVersion: 1,
      sessions: {
        "claude:session-a": {
          source: "claude",
          sessionId: "session-a",
          phase: "completed",
          generation: 1,
          confidence: "native",
          startedAt: 1_786_536_000_000,
          completedAt: 1_786_536_060_000,
          responseEwmaSeconds: null,
          updatedAt: 1_786_536_060_000,
        },
      },
      surfaces: {},
      seenEventIds: [],
    })}\n`,
    { mode: 0o600 },
  );

  const state = await new FileSideGlanceStore({ directory }).read();
  assert.deepEqual(state.sessions, {});
  assert.ok(
    (await readdir(directory)).some((name) =>
      name.startsWith("side-glance-state.corrupt-"),
    ),
  );
});

test("reclaims a stale lock only after proving its owner is gone", async (context) => {
  const directory = await temporaryDirectory();
  context.after(() => rm(directory, { recursive: true, force: true }));
  const lockPath = path.join(directory, ".side-glance-state.lock");
  const ownerPath = path.join(lockPath, "owner.json");

  await mkdir(lockPath, { recursive: true, mode: 0o700 });
  await writeFile(
    ownerPath,
    JSON.stringify({ pid: process.pid, createdAt: 0, nonce: "live-owner" }),
    { mode: 0o600 },
  );

  const cautiousStore = new FileSideGlanceStore({
    directory,
    staleLockMs: 1,
    lockTimeoutMs: 40,
    retryDelayMs: 5,
  });
  await assert.rejects(() => cautiousStore.update((state) => state), /lock/i);

  await writeFile(
    ownerPath,
    JSON.stringify({ pid: 2_147_483_647, createdAt: 0, nonce: "dead-owner" }),
    { mode: 0o600 },
  );

  const recoveryStore = new FileSideGlanceStore({
    directory,
    staleLockMs: 1,
  });
  const recovered = await recoveryStore.update((state) => state);
  assert.equal(recovered.schemaVersion, 1);
  assert.equal((await readdir(directory)).includes(".side-glance-state.lock"), false);
});
