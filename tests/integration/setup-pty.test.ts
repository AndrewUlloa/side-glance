import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../../src/cli/entry.ts", import.meta.url));

test(
  "guided init completes a static no-color happy path through a real PTY",
  { skip: process.platform === "win32" },
  async (context) => {
    const home = await mkdtemp(path.join(tmpdir(), "side-glance-setup-pty-"));
    context.after(() => rm(home, { recursive: true, force: true }));
    const bin = path.join(home, "bin");
    const executable = path.join(bin, "side-glance");
    const provider = path.join(bin, "claude");
    await mkdir(bin, { recursive: true });
    await writeFile(executable, "#!/bin/sh\nprintf 'development\\n'\n", {
      mode: 0o700,
    });
    await writeFile(provider, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    await chmod(executable, 0o700);

    const runner = path.join(home, "run-guided-setup.sh");
    await writeFile(
      runner,
      `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(cliPath)} init --home ${shellQuote(home)} --executable ${shellQuote(executable)}\n`,
      { mode: 0o700 },
    );
    const environment = {
      HOME: home,
      PATH: `${bin}${path.delimiter}/usr/bin${path.delimiter}/bin`,
      NO_COLOR: "1",
    };
    const result =
      process.platform === "darwin"
        ? await runExpectPty(home, runner, environment)
        : await runPty(
            ["-qec", runner, "/dev/null"],
            environment,
            "9\n\nnone\ny\n",
          );

    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Select provider integrations/u);
    assert.match(result.output, /Side Glance setup plan:/u);
    assert.match(result.output, /Setup complete/u);
    assert.equal(result.output.includes(String.fromCodePoint(27)), false);
    const settings = JSON.parse(
      await readFile(path.join(home, ".claude", "settings.json"), "utf8"),
    );
    assert.ok(JSON.stringify(settings).includes(executable));
  },
);

async function runExpectPty(
  home: string,
  runner: string,
  environment: Record<string, string>,
): Promise<{ code: number | null; output: string }> {
  const expectScript = path.join(home, "guided-setup.exp");
  await writeFile(
    expectScript,
    `#!/usr/bin/expect -f
set timeout 20
spawn [lindex $argv 0]
expect -exact {Choose comma-separated numbers or names [default]: }
send "9\\r"
expect -exact {Choose available numbers or names.}
expect -exact {Choose comma-separated numbers or names [default]: }
send "\\r"
expect -exact {Choose comma-separated numbers or names [default]: }
send "none\\r"
expect -exact {Apply this setup plan? [Y/n] }
send "y\\r"
expect eof
set result [wait]
exit [lindex $result 3]
`,
    { mode: 0o700 },
  );
  return runProcess("/usr/bin/expect", [expectScript, runner], environment);
}

function runPty(
  args: readonly string[],
  environment: Record<string, string>,
  input: string,
): Promise<{ code: number | null; output: string }> {
  return runProcess("/usr/bin/script", args, environment, input);
}

function runProcess(
  executable: string,
  args: readonly string[],
  environment: Record<string, string>,
  input?: string,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      env: { ...process.env, ...environment },
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let output = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), 10_000);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      output += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      output += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, output });
    });
    if (input !== undefined) child.stdin?.end(input);
  });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
