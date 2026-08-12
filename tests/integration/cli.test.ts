import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../../src/cli/index.ts", import.meta.url));

interface CliResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

async function runCli(
  args: readonly string[],
  options: { input?: string; stateDirectory: string },
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        SIGNAL_STATE_DIR: options.stateDirectory,
        NO_COLOR: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
    child.stdin.end(options.input);
  });
}

async function stateDirectory(context: test.TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "signal-cli-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("accepts a normalized event and reports status without prompt content", async (context) => {
  const directory = await stateDirectory(context);
  const payload = {
    v: 1,
    eventId: "event-1",
    source: "claude",
    sessionId: "session-1",
    kind: "turn.started",
    occurredAt: 1_000,
    generation: 1,
    turnId: "turn-1",
    confidence: "native",
    target: { surfaceId: "test:cli" },
  };

  const submitted = await runCli(["event", "--json"], {
    stateDirectory: directory,
    input: JSON.stringify(payload),
  });
  assert.equal(submitted.code, 0, submitted.stderr);
  assert.equal(JSON.parse(submitted.stdout).sessions["claude:session-1"].phase, "working");

  const status = await runCli(["status", "--json"], {
    stateDirectory: directory,
  });
  assert.equal(status.code, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).sessions["claude:session-1"].turnId, "turn-1");
  assert.equal(status.stdout.includes("prompt"), false);
});

test("rejects malformed event JSON without creating executable state", async (context) => {
  const directory = await stateDirectory(context);
  const result = await runCli(["event", "--json"], {
    stateDirectory: directory,
    input: JSON.stringify({
      v: 1,
      eventId: "bad",
      source: "claude",
      sessionId: "../../owned",
      kind: "turn.started",
      occurredAt: "now",
      prompt: "$(touch owned)",
    }),
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /event|occurredAt|field/i);
});

test("doctor and preview are deterministic and do not require a live terminal", async (context) => {
  const directory = await stateDirectory(context);
  const doctor = await runCli(["doctor", "--json"], {
    stateDirectory: directory,
  });
  const preview = await runCli(
    ["preview", "--phase", "waiting", "--elapsed", "60", "--json"],
    { stateDirectory: directory },
  );

  assert.equal(doctor.code, 0, doctor.stderr);
  assert.equal(JSON.parse(doctor.stdout).stateDirectory, directory);
  assert.equal(JSON.parse(doctor.stdout).node.supported, true);
  assert.equal(preview.code, 0, preview.stderr);
  assert.deepEqual(JSON.parse(preview.stdout), {
    phase: "waiting",
    urgency: 500,
    wash: "3a2f16",
    accent: "e0a726",
  });
});

test("supervised run preserves child output and nonzero exit while cleaning its lease", async (context) => {
  const directory = await stateDirectory(context);
  const result = await runCli(
    [
      "run",
      "--surface",
      "test:wrapper",
      "--",
      process.execPath,
      "-e",
      'process.stdout.write("child-output"); process.exit(7)',
    ],
    { stateDirectory: directory },
  );

  assert.equal(result.code, 7, result.stderr);
  assert.equal(result.stdout, "child-output");
  const state = JSON.parse(
    await readFile(path.join(directory, "signal-state.json"), "utf8"),
  );
  const session = Object.values(state.sessions)[0] as {
    phase: string;
    reason?: string;
  };
  assert.equal(session.phase, "inactive");
  assert.equal(session.reason, "exit:7");
});

test(
  "supervised run forwards termination, records cleanup, and exits by the same signal",
  { skip: process.platform === "win32" },
  async (context) => {
    const directory = await stateDirectory(context);
    const result = await new Promise<CliResult>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          cliPath,
          "run",
          "--surface",
          "test:signal-forwarding",
          "--",
          process.execPath,
          "-e",
          'process.stdout.write("ready\\n"); setInterval(() => {}, 1_000)',
        ],
        {
          env: { ...process.env, SIGNAL_STATE_DIR: directory, NO_COLOR: "1" },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stdout = "";
      let stderr = "";
      let terminationSent = false;
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        if (!terminationSent && stdout.includes("ready\n")) {
          terminationSent = true;
          child.kill("SIGTERM");
        }
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
    });

    assert.equal(result.code, null, result.stderr);
    assert.equal(result.signal, "SIGTERM");
    const state = JSON.parse(
      await readFile(path.join(directory, "signal-state.json"), "utf8"),
    );
    const session = Object.values(state.sessions)[0] as {
      phase: string;
      reason?: string;
    };
    assert.equal(session.phase, "inactive");
    assert.equal(session.reason, "signal:SIGTERM");
  },
);

test("reset releases only the selected session", async (context) => {
  const directory = await stateDirectory(context);
  for (const sessionId of ["one", "two"]) {
    await runCli(["event", "--json"], {
      stateDirectory: directory,
      input: JSON.stringify({
        v: 1,
        eventId: `start-${sessionId}`,
        source: "generic",
        sessionId,
        kind: "turn.started",
        occurredAt: 1_000,
        generation: 1,
        confidence: "wrapper",
        target: { surfaceId: "test:shared" },
      }),
    });
  }

  const reset = await runCli(
    ["reset", "--source", "generic", "--session", "one", "--json"],
    { stateDirectory: directory },
  );
  assert.equal(reset.code, 0, reset.stderr);
  const sessions = JSON.parse(reset.stdout).sessions;
  assert.equal(sessions["generic:one"].phase, "inactive");
  assert.equal(sessions["generic:two"].phase, "working");
});
