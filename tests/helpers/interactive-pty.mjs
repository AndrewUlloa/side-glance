import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function runInteractivePty(options) {
  if (process.platform === "win32") {
    throw new Error("interactive PTY verification is unavailable on Windows");
  }
  const temporary = await mkdtemp(path.join(tmpdir(), "side-glance-artifact-pty-"));
  try {
    const runner = path.join(temporary, "run.sh");
    const runnerPid = path.join(temporary, "runner.pid");
    await writeFile(
      runner,
      `#!/bin/sh
printf '%s' "$$" > ${shellQuote(runnerPid)}
before=$(stty -g)
${[options.executable, ...options.arguments].map(shellQuote).join(" ")}
status=$?
after=$(stty -g)
test "$before" = "$after" || exit 86
exit $status
`,
      { mode: 0o700 },
    );
    if (process.platform === "darwin") {
      return await runExpect(temporary, runner, runnerPid, options);
    }
    return await runProcess(
      "/usr/bin/script",
      ["-qec", runner, "/dev/null"],
      runnerPid,
      options,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function runExpect(temporary, runner, runnerPid, options) {
  const expectScript = path.join(temporary, "run.exp");
  const interactions = options.interactions
    .map(
      ({ prompt, answer }) =>
        `expect -exact {${prompt.replaceAll("}", "\\}")}}\nsend "${expectAnswer(answer)}"`,
    )
    .join("\n");
  await writeFile(
    expectScript,
    `#!/usr/bin/expect -f
set timeout 20
spawn [lindex $argv 0]
${interactions}
expect eof
set result [wait]
exit [lindex $result 3]
`,
    { mode: 0o700 },
  );
  return await runProcess(
    "/usr/bin/expect",
    [expectScript, runner],
    runnerPid,
    {
      ...options,
      interactions: [],
    },
  );
}

function runProcess(executable, arguments_, runnerPid, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, {
      cwd: options.cwd,
      env: childEnvironment(options.environment),
      stdio: [options.interactions.length === 0 ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let output = "";
    let interactionIndex = 0;
    let searchOffset = 0;
    const drive = () => {
      while (interactionIndex < options.interactions.length) {
        const interaction = options.interactions[interactionIndex];
        const promptIndex = output.indexOf(interaction.prompt, searchOffset);
        if (promptIndex < 0) return;
        searchOffset = promptIndex + interaction.prompt.length;
        child.stdin?.write(interaction.answer);
        interactionIndex += 1;
      }
    };
    const timeout = setTimeout(() => {
      void terminateProcessGroup(runnerPid, child, "SIGTERM");
    }, 20_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      drive();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
      drive();
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      if (code === (options.expectedExitCode ?? 0)) {
        resolve({ code, output });
        return;
      }
      reject(
        new Error(
          `${executable} failed (${signal ?? code}):\n${output}`,
        ),
      );
    });
  });
}

async function terminateProcessGroup(runnerPid, child, signal) {
  try {
    const pid = Number.parseInt(await readFile(runnerPid, "utf8"), 10);
    if (Number.isSafeInteger(pid) && pid > 1) {
      process.kill(-pid, signal);
      return;
    }
  } catch {
    // The runner may not have reached its PID record before timeout.
  }
  child.kill(signal);
}

function childEnvironment(overrides) {
  const environment = { ...process.env, ...overrides };
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete environment[key];
  }
  return environment;
}

function expectAnswer(value) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\u001b", "\\033")
    .replaceAll("[", "\\[")
    .replaceAll('"', '\\"')
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\r");
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
