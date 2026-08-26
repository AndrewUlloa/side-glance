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
  symlink,
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

  const state = await new FileSideGlanceStore({
    directory,
    rootDirectory: path.dirname(directory),
  }).read();
  assert.equal(Object.keys(state.sessions).length, 4);
  assert.equal(state.seenEventIds.length, 32);
  assert.ok(
    Object.values(state.sessions).every((session) => session.generation === 8),
  );
});

test("writes private state atomically and quarantines malformed state", async (context) => {
  const directory = await temporaryDirectory();
  context.after(() => rm(directory, { recursive: true, force: true }));
  const store = new FileSideGlanceStore({
    directory,
    rootDirectory: path.dirname(directory),
  });

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
    schemaVersion: 2,
    sessions: {},
    surfaces: {},
    seenEventIds: [],
    durationProfiles: {},
  });

  const files = await readdir(directory);
  assert.ok(files.some((name) => name.startsWith("side-glance-state.corrupt-")));
  const persistedReset = await readFile(statePath, "utf8");
  assert.doesNotThrow(() => JSON.parse(persistedReset));
});

test("never enters through an intermediate linked state parent", async (context) => {
  const root = await temporaryDirectory();
  context.after(() => rm(root, { recursive: true, force: true }));
  const outside = path.join(root, "outside");
  const alias = path.join(root, "alias");
  await mkdir(outside);
  await symlink(outside, alias, "dir");
  const store = new FileSideGlanceStore({
    directory: path.join(alias, "side-glance"),
    rootDirectory: root,
  });

  await assert.rejects(() => store.read(), /link/iu);
  assert.deepEqual(await readdir(outside), []);
});

test("never migrates legacy state through an intermediate linked parent", async (context) => {
  const root = await temporaryDirectory();
  context.after(() => rm(root, { recursive: true, force: true }));
  const outside = path.join(root, "outside");
  const alias = path.join(root, "legacy-alias");
  const directory = path.join(root, "current");
  await mkdir(outside);
  await writeFile(
    path.join(outside, "signal-state.json"),
    `${JSON.stringify({
      schemaVersion: 2,
      sessions: {},
      surfaces: {},
      seenEventIds: [],
      durationProfiles: {},
    })}\n`,
    { mode: 0o600 },
  );
  await symlink(outside, alias, "dir");

  const store = new FileSideGlanceStore({
    directory,
    rootDirectory: root,
    legacyDirectory: alias,
    legacyRootDirectory: root,
  });
  await assert.rejects(() => store.read(), /link/iu);
  await assert.rejects(() => readFile(path.join(directory, "side-glance-state.json")));
});

test("quarantines non-numeric adaptive duration profiles", async (context) => {
  const directory = await temporaryDirectory();
  context.after(() => rm(directory, { recursive: true, force: true }));
  const statePath = path.join(directory, "side-glance-state.json");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(
    statePath,
    `${JSON.stringify({
      schemaVersion: 2,
      sessions: {},
      surfaces: {},
      seenEventIds: [],
      durationProfiles: {
        claude: {
          algorithmVersion: 1,
          samplesSeconds: ["private-not-a-number"],
          ceilingSeconds: 300,
        },
      },
    })}\n`,
    { mode: 0o600 },
  );

  const state = await new FileSideGlanceStore({
    directory,
    rootDirectory: path.dirname(directory),
  }).read();
  assert.deepEqual(state.sessions, {});
  assert.ok(
    (await readdir(directory)).some((name) =>
      name.startsWith("side-glance-state.corrupt-"),
    ),
  );
});

test("quarantines open or incoherent schema-two lifecycle metadata", async (context) => {
  const root = await temporaryDirectory();
  context.after(() => rm(root, { recursive: true, force: true }));
  const baseline = {
    schemaVersion: 2,
    sessions: {
      "claude:session-a": {
        source: "claude",
        sessionId: "session-a",
        phase: "working",
        generation: 1,
        confidence: "native",
        activeWork: [{ id: "subagent:a", kind: "subagent" }],
        updatedAt: 1_000,
      },
    },
    surfaces: {},
    seenEventIds: [],
    durationProfiles: {
      claude: {
        algorithmVersion: 1,
        samplesSeconds: [],
        ceilingSeconds: 300,
      },
    },
  };
  const variants = [
    { ...baseline, private: "PRIVATE" },
    {
      ...baseline,
      sessions: {
        "claude:session-a": {
          ...baseline.sessions["claude:session-a"],
          activeWork: [
            { id: "subagent:a", kind: "subagent", prompt: "PRIVATE" },
          ],
        },
      },
    },
    {
      ...baseline,
      sessions: {
        "claude:session-a": {
          ...baseline.sessions["claude:session-a"],
          activeWork: [{ id: "subagent:\u001bescape", kind: "subagent" }],
        },
      },
    },
    {
      ...baseline,
      durationProfiles: {
        claude: {
          ...baseline.durationProfiles.claude,
          transcript: "PRIVATE",
        },
      },
    },
    {
      ...baseline,
      durationProfiles: {
        claude: {
          algorithmVersion: 1,
          samplesSeconds: [],
          ceilingSeconds: 7_200,
        },
      },
    },
    {
      ...baseline,
      sessions: {
        "claude:session-a": {
          ...baseline.sessions["claude:session-a"],
          target: { surfaceId: "tmux:bad-pane", tmuxPane: "not-a-pane" },
        },
      },
    },
    {
      ...baseline,
      surfaces: {
        "tmux:poisoned": {
          surfaceId: "tmux:poisoned",
          target: { surfaceId: "tmux:poisoned", tmuxPane: "%3" },
          phase: "working",
          generation: 1,
          updatedAt: 1_000,
          terminalPainted: false,
          tmuxSnapshot: {
            windowId: "@7",
            options: [
              { name: "window-status-style", local: true, value: "bad\u0000value" },
              { name: "window-status-current-style", local: false },
              { name: "window-status-format", local: false },
              { name: "window-status-current-format", local: false },
            ],
          },
        },
      },
    },
  ];

  for (const [index, variant] of variants.entries()) {
    const directory = path.join(root, String(index));
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      path.join(directory, "side-glance-state.json"),
      `${JSON.stringify(variant)}\n`,
      { mode: 0o600 },
    );
    const state = await new FileSideGlanceStore({
      directory,
      rootDirectory: root,
    }).read();
    assert.deepEqual(state.sessions, {});
    assert.ok(
      (await readdir(directory)).some((name) =>
        name.startsWith("side-glance-state.corrupt-"),
      ),
    );
  }
});

test("migrates valid schema-one state without losing lifecycle data", async (context) => {
  const directory = await temporaryDirectory();
  context.after(() => rm(directory, { recursive: true, force: true }));
  const statePath = path.join(directory, "side-glance-state.json");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const legacy = {
    schemaVersion: 1,
    sessions: {
      "claude:session-a": {
        source: "claude",
        sessionId: "session-a",
        phase: "working",
        generation: 3,
        confidence: "native",
        responseEwmaSeconds: 42.5,
        updatedAt: 42,
      },
    },
    surfaces: {
      "logical:session-a": {
        surfaceId: "logical:session-a",
        target: { surfaceId: "logical:session-a" },
        phase: "working",
        generation: 3,
        updatedAt: 42,
        terminalPainted: false,
      },
    },
    seenEventIds: ["legacy-event"],
  };
  await writeFile(statePath, `${JSON.stringify(legacy)}\n`, { mode: 0o600 });

  const migrated = await new FileSideGlanceStore({
    directory,
    rootDirectory: path.dirname(directory),
  }).read();

  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.sessions, legacy.sessions);
  assert.deepEqual(migrated.surfaces, legacy.surfaces);
  assert.deepEqual(migrated.seenEventIds, legacy.seenEventIds);
  assert.deepEqual(migrated.durationProfiles, {});
  assert.equal(
    JSON.parse(await readFile(statePath, "utf8")).schemaVersion,
    1,
    "read-only migration must not rewrite or repaint state",
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
    rootDirectory: path.dirname(directory),
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
    rootDirectory: path.dirname(directory),
    staleLockMs: 1,
  });
  const recovered = await recoveryStore.update((state) => state);
  assert.equal(recovered.schemaVersion, 2);
  assert.equal((await readdir(directory)).includes(".side-glance-state.lock"), false);
});
