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

import { runInteractivePty } from "../helpers/interactive-pty.mjs";

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
      SHELL: "/bin/zsh",
      NO_COLOR: "1",
      TERM: "xterm-256color",
    };
    const result =
      process.platform === "darwin"
        ? await runExpectPty(home, runner, environment)
        : await runPty(
            ["-qec", runner, "/dev/null"],
            environment,
            [
              {
                prompt: "Choose comma-separated numbers or names [default]: ",
                answer: "\n",
              },
              { prompt: "Apply this setup plan? [Y/n] ", answer: "y\n" },
            ],
          );

    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /How would you like to continue/u);
    assert.match(result.output, /Review/u);
    assert.match(result.output, /Side Glance is ready/u);
    assert.match(result.output, /Next[\s\S]*\r?\n[ ]{2}claude\r?\n/u);
    assert.equal(result.output.includes(String.fromCodePoint(27)), false);
    const settings = JSON.parse(
      await readFile(path.join(home, ".claude", "settings.json"), "utf8"),
    );
    assert.ok(JSON.stringify(settings).includes(executable));
    assert.match(
      await readFile(path.join(home, ".zshrc"), "utf8"),
      /Side Glance fresh terminal tabs/u,
    );
  },
);

test(
  "guided init supports arrow and Space customization through a real PTY",
  { skip: process.platform === "win32" },
  async (context) => {
    const home = await mkdtemp(path.join(tmpdir(), "side-glance-arrow-pty-"));
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

    const runner = path.join(home, "run-arrow-setup.sh");
    await writeFile(
      runner,
      `#!/bin/sh
before=$(stty -g)
${shellQuote(process.execPath)} ${shellQuote(cliPath)} init --home ${shellQuote(home)} --executable ${shellQuote(executable)}
status=$?
after=$(stty -g)
test "$before" = "$after" || exit 86
exit $status
`,
      { mode: 0o700 },
    );
    const environment = {
      HOME: home,
      PATH: `${bin}${path.delimiter}/usr/bin${path.delimiter}/bin`,
      NO_COLOR: undefined,
      SIDE_GLANCE_ACCESSIBLE: undefined,
      SIDE_GLANCE_CONFIG_DIR: path.join(home, ".config", "side-glance"),
      SHELL: "/bin/zsh",
      TERM: "xterm-256color",
    };
    const interactions = [
      {
        prompt: "How would you like to continue?",
        answer: "\u001b[B\r",
      },
      {
        prompt: "Select provider integrations",
        answer: "\r",
      },
      {
        prompt: "Select Side Glance computer notifications",
        answer: " \r",
      },
      {
        prompt: "How should new terminal tabs start?",
        answer: "\r",
      },
      {
        prompt: "What should colors communicate?",
        answer: "\u001b[B\r",
      },
      {
        prompt: "How should Heat set its ceiling?",
        answer: "\r",
      },
      { prompt: "Apply this setup plan? [Y/n] ", answer: "y\n" },
    ];
    const result =
      process.platform === "darwin"
        ? await runExpectArrowPty(home, runner, environment)
        : await runPty(["-qec", runner, "/dev/null"], environment, interactions);

    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /↑\/↓ move/u);
    assert.match(result.output, /Space toggle/u);
    assert.match(result.output, /Computer notifications: Off/u);
    assert.match(result.output, /Side Glance is ready/u);
    assert.equal(result.output.includes(String.fromCodePoint(27)), true);
    const settings = JSON.parse(
      await readFile(path.join(home, ".claude", "settings.json"), "utf8"),
    );
    assert.ok(JSON.stringify(settings).includes(executable));
    const config = JSON.parse(
      await readFile(
        path.join(home, ".config", "side-glance", "config.json"),
        "utf8",
      ),
    );
    assert.deepEqual(config.appearance, {
      preset: "heat",
      ceiling: { mode: "adaptive" },
    });
  },
);

test(
  "theme setup supports arrow-key Heat selection through a real PTY",
  { skip: process.platform === "win32" },
  async (context) => {
    const home = await mkdtemp(path.join(tmpdir(), "side-glance-theme-pty-"));
    context.after(() => rm(home, { recursive: true, force: true }));
    const stateDirectory = path.join(home, "state");
    const configDirectory = path.join(home, "config");

    const result = await runInteractivePty({
      executable: process.execPath,
      arguments: [cliPath, "theme"],
      cwd: home,
      environment: {
        HOME: home,
        NO_COLOR: undefined,
        SIDE_GLANCE_ACCESSIBLE: undefined,
        SIDE_GLANCE_STATE_DIR: stateDirectory,
        SIDE_GLANCE_CONFIG_DIR: configDirectory,
        TERM: "xterm-256color",
      },
      interactions: [
        {
          prompt: "What should colors communicate?",
          answer: "\u001b[B\r",
        },
        {
          prompt: "How should Heat set its ceiling?",
          answer: "\r",
        },
        { prompt: "Apply these colors? [Y/n] ", answer: "y\n" },
      ],
    });

    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /↑\/↓ move/u);
    assert.match(result.output, /under 10s.*visually quiet/iu);
    assert.match(result.output, /Colors updated/u);
    const config = JSON.parse(
      await readFile(path.join(configDirectory, "config.json"), "utf8"),
    );
    assert.deepEqual(config.appearance, {
      preset: "heat",
      ceiling: { mode: "adaptive" },
    });
  },
);

test(
  "theme setup reviews every semantic Status color through a real PTY",
  { skip: process.platform === "win32" },
  async (context) => {
    const home = await mkdtemp(path.join(tmpdir(), "side-glance-theme-status-pty-"));
    context.after(() => rm(home, { recursive: true, force: true }));
    const configDirectory = path.join(home, "config");

    const result = await runInteractivePty({
      executable: process.execPath,
      arguments: [cliPath, "theme"],
      cwd: home,
      environment: {
        HOME: home,
        NO_COLOR: undefined,
        SIDE_GLANCE_ACCESSIBLE: undefined,
        SIDE_GLANCE_STATE_DIR: path.join(home, "state"),
        SIDE_GLANCE_CONFIG_DIR: configDirectory,
        TERM: "xterm-256color",
      },
      interactions: [
        { prompt: "What should colors communicate?", answer: "\r" },
        { prompt: "Apply these colors? [Y/n] ", answer: "y\n" },
      ],
    });

    assert.equal(result.code, 0, result.output);
    assert.match(
      result.output,
      /Colors: Status[\s\S]*Working cyan · Waiting amber · Ready green · Failed red · Inactive neutral/u,
    );
  },
);

test(
  "theme setup explains and retries an invalid fixed Heat ceiling",
  { skip: process.platform === "win32" },
  async (context) => {
    const home = await mkdtemp(path.join(tmpdir(), "side-glance-theme-retry-pty-"));
    context.after(() => rm(home, { recursive: true, force: true }));
    const configDirectory = path.join(home, "config");

    const result = await runInteractivePty({
      executable: process.execPath,
      arguments: [cliPath, "theme"],
      cwd: home,
      environment: {
        HOME: home,
        NO_COLOR: undefined,
        SIDE_GLANCE_STATE_DIR: path.join(home, "state"),
        SIDE_GLANCE_CONFIG_DIR: configDirectory,
        TERM: "xterm-256color",
      },
      interactions: [
        {
          prompt: "What should colors communicate?",
          answer: "\u001b[B\r",
        },
        {
          prompt: "How should Heat set its ceiling?",
          answer: "\u001b[B\r",
        },
        { prompt: "Fixed ceiling in seconds [300] ", answer: "nope\n" },
        { prompt: "Fixed ceiling in seconds [300] ", answer: "120\n" },
        { prompt: "Apply these colors? [Y/n] ", answer: "y\n" },
      ],
    });

    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /integer from 60 to 7200 seconds/u);
    const config = JSON.parse(
      await readFile(path.join(configDirectory, "config.json"), "utf8"),
    );
    assert.deepEqual(config.appearance, {
      preset: "heat",
      ceiling: { mode: "fixed", seconds: 120 },
    });
  },
);

test(
  "theme setup preserves the current Heat choice by default",
  { skip: process.platform === "win32" },
  async (context) => {
    const home = await mkdtemp(path.join(tmpdir(), "side-glance-theme-current-pty-"));
    context.after(() => rm(home, { recursive: true, force: true }));
    const configDirectory = path.join(home, "config");
    await mkdir(configDirectory, { recursive: true });
    await writeFile(
      path.join(configDirectory, "config.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        appearance: { preset: "heat", ceiling: { mode: "adaptive" } },
      })}\n`,
    );

    const result = await runInteractivePty({
      executable: process.execPath,
      arguments: [cliPath, "theme"],
      cwd: home,
      environment: {
        HOME: home,
        NO_COLOR: undefined,
        SIDE_GLANCE_STATE_DIR: path.join(home, "state"),
        SIDE_GLANCE_CONFIG_DIR: configDirectory,
        TERM: "xterm-256color",
      },
      interactions: [
        { prompt: "What should colors communicate?", answer: "\r" },
        { prompt: "How should Heat set its ceiling?", answer: "\r" },
        { prompt: "Apply these colors? [Y/n] ", answer: "y\n" },
      ],
    });

    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Heat.*current/u);
    const config = JSON.parse(
      await readFile(path.join(configDirectory, "config.json"), "utf8"),
    );
    assert.deepEqual(config.appearance, {
      preset: "heat",
      ceiling: { mode: "adaptive" },
    });
  },
);

test(
  "theme setup saves and reviews exact Custom pairs through a real PTY",
  { skip: process.platform === "win32" },
  async (context) => {
    const home = await mkdtemp(path.join(tmpdir(), "side-glance-theme-custom-pty-"));
    context.after(() => rm(home, { recursive: true, force: true }));
    const configDirectory = path.join(home, "config");
    const result = await runInteractivePty({
      executable: process.execPath,
      arguments: [cliPath, "theme"],
      cwd: home,
      environment: {
        HOME: home,
        NO_COLOR: undefined,
        SIDE_GLANCE_ACCESSIBLE: undefined,
        SIDE_GLANCE_STATE_DIR: path.join(home, "state"),
        SIDE_GLANCE_CONFIG_DIR: configDirectory,
        TERM: "xterm-256color",
      },
      interactions: [
        {
          prompt: "What should colors communicate?",
          answer: "\u001b[B\u001b[B\r",
        },
        { prompt: "Inactive wash:accent [101313:71807d] ", answer: "\n" },
        { prompt: "Working wash:accent [16352f:009d89] ", answer: "\n" },
        { prompt: "Waiting wash:accent [4d3510:f0a726] ", answer: "\n" },
        { prompt: "Ready wash:accent [173326:3fa84e] ", answer: "\n" },
        { prompt: "Failed wash:accent [732018:f33533] ", answer: "\n" },
        { prompt: "Apply these colors? [Y/n] ", answer: "y\n" },
      ],
    });

    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Colors: Custom[\s\S]*Ready: 173326:3fa84e/u);
    assert.match(result.output, /next lifecycle event/u);
    const config = JSON.parse(
      await readFile(path.join(configDirectory, "config.json"), "utf8"),
    );
    assert.equal(config.appearance.preset, "custom");
    assert.deepEqual(config.appearance.colors.ready, {
      wash: "173326",
      accent: "3fa84e",
    });
  },
);

test(
  "theme setup exits without writing and keeps the current configuration",
  { skip: process.platform === "win32" },
  async (context) => {
    const home = await mkdtemp(path.join(tmpdir(), "side-glance-theme-exit-pty-"));
    context.after(() => rm(home, { recursive: true, force: true }));
    const configDirectory = path.join(home, "config");
    await mkdir(configDirectory, { recursive: true });
    const configPath = path.join(configDirectory, "config.json");
    const original = `${JSON.stringify({
      schemaVersion: 1,
      appearance: { preset: "heat", ceiling: { mode: "fixed", seconds: 600 } },
    })}\n`;
    await writeFile(configPath, original);

    const result = await runInteractivePty({
      executable: process.execPath,
      arguments: [cliPath, "theme"],
      cwd: home,
      environment: {
        HOME: home,
        NO_COLOR: undefined,
        SIDE_GLANCE_ACCESSIBLE: undefined,
        SIDE_GLANCE_STATE_DIR: path.join(home, "state"),
        SIDE_GLANCE_CONFIG_DIR: configDirectory,
        TERM: "xterm-256color",
      },
      interactions: [
        {
          prompt: "What should colors communicate?",
          answer: "\u001b[B\u001b[B\r",
        },
      ],
    });

    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /No color changes were made/u);
    assert.equal(await readFile(configPath, "utf8"), original);
  },
);

test(
  "theme setup keeps accessible terminals static and ANSI-free",
  { skip: process.platform === "win32" },
  async (context) => {
    const home = await mkdtemp(path.join(tmpdir(), "side-glance-theme-accessible-pty-"));
    context.after(() => rm(home, { recursive: true, force: true }));
    const configDirectory = path.join(home, "config");
    const result = await runInteractivePty({
      executable: process.execPath,
      arguments: [cliPath, "theme"],
      cwd: home,
      environment: {
        HOME: home,
        SIDE_GLANCE_ACCESSIBLE: "1",
        SIDE_GLANCE_STATE_DIR: path.join(home, "state"),
        SIDE_GLANCE_CONFIG_DIR: configDirectory,
        TERM: "xterm-256color",
      },
      interactions: [
        {
          prompt: "Choose comma-separated numbers or names [default]: ",
          answer: "4\n",
        },
      ],
    });

    assert.equal(result.code, 0, result.output);
    assert.equal(result.output.includes(String.fromCodePoint(27)), false);
    assert.match(result.output, /4\. \[ \] Exit without changing colors/u);
    assert.match(result.output, /No color changes were made/u);
    await assert.rejects(
      () => readFile(path.join(configDirectory, "config.json"), "utf8"),
      /ENOENT/u,
    );
  },
);

test(
  "guided init restores the real terminal when Ctrl-C cancels a choice",
  { skip: process.platform === "win32" },
  async (context) => {
    const home = await mkdtemp(path.join(tmpdir(), "side-glance-cancel-pty-"));
    context.after(() => rm(home, { recursive: true, force: true }));
    const bin = path.join(home, "bin");
    const executable = path.join(bin, "side-glance");
    const provider = path.join(bin, "claude");
    await mkdir(bin, { recursive: true });
    await writeFile(executable, "#!/bin/sh\nprintf 'development\\n'\n", {
      mode: 0o700,
    });
    await writeFile(provider, "#!/bin/sh\nexit 0\n", { mode: 0o700 });

    const result = await runInteractivePty({
      executable: process.execPath,
      arguments: [
        cliPath,
        "init",
        "--home",
        home,
        "--executable",
        executable,
      ],
      cwd: home,
      environment: {
        HOME: home,
        NO_COLOR: undefined,
        SIDE_GLANCE_ACCESSIBLE: undefined,
        TERM: "xterm-256color",
        PATH: `${bin}${path.delimiter}/usr/bin${path.delimiter}/bin`,
      },
      expectedExitCode: 130,
      interactions: [
        { prompt: "How would you like to continue?", answer: "\u0003" },
      ],
    });

    assert.equal(result.code, 130);
    await assert.rejects(
      () => readFile(path.join(home, ".claude", "settings.json"), "utf8"),
      /ENOENT/u,
    );
  },
);

test(
  "guided init keeps accessible and dumb terminals static and ANSI-free",
  { skip: process.platform === "win32" },
  async (context) => {
    for (const fallback of ["accessible", "dumb"] as const) {
      const home = await mkdtemp(
        path.join(tmpdir(), `side-glance-${fallback}-pty-`),
      );
      context.after(() => rm(home, { recursive: true, force: true }));
      const bin = path.join(home, "bin");
      const executable = path.join(bin, "side-glance");
      const provider = path.join(bin, "claude");
      await mkdir(bin, { recursive: true });
      await writeFile(executable, "#!/bin/sh\nprintf 'development\\n'\n", {
        mode: 0o700,
      });
      await writeFile(provider, "#!/bin/sh\nexit 0\n", { mode: 0o700 });

      const result = await runInteractivePty({
        executable: process.execPath,
        arguments: [
          cliPath,
          "init",
          "--home",
          home,
          "--executable",
          executable,
        ],
        cwd: home,
        environment: {
          HOME: home,
          NO_COLOR: undefined,
          SIDE_GLANCE_ACCESSIBLE: fallback === "accessible" ? "1" : undefined,
          TERM: fallback === "dumb" ? "dumb" : "xterm-256color",
          PATH: `${bin}${path.delimiter}/usr/bin${path.delimiter}/bin`,
        },
        interactions: [
          {
            prompt: "Choose comma-separated numbers or names [default]: ",
            answer: "\n",
          },
          { prompt: "Apply this setup plan? [Y/n] ", answer: "n\n" },
        ],
      });

      assert.equal(
        result.output.includes(String.fromCodePoint(27)),
        false,
        `${fallback}: ${result.output}`,
      );
    }
  },
);

test(
  "guided init restores the prompt when the process receives SIGINT",
  { skip: process.platform === "win32" },
  async (context) => {
    const home = await mkdtemp(path.join(tmpdir(), "side-glance-sigint-pty-"));
    context.after(() => rm(home, { recursive: true, force: true }));
    const bin = path.join(home, "bin");
    const executable = path.join(bin, "side-glance");
    const provider = path.join(bin, "claude");
    const runnerPid = path.join(home, "runner.pid");
    await mkdir(bin, { recursive: true });
    await writeFile(executable, "#!/bin/sh\nprintf 'development\\n'\n", {
      mode: 0o700,
    });
    await writeFile(provider, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    const runner = path.join(home, "run-signal-setup.sh");
    await writeFile(
      runner,
      `#!/bin/sh
printf '%s' "$$" > ${shellQuote(runnerPid)}
exec ${shellQuote(process.execPath)} ${shellQuote(cliPath)} init --home ${shellQuote(home)} --executable ${shellQuote(executable)}
`,
      { mode: 0o700 },
    );
    const result = await runSignalPty(home, runner, runnerPid, {
      HOME: home,
      PATH: `${bin}${path.delimiter}/usr/bin${path.delimiter}/bin`,
      NO_COLOR: undefined,
      SIDE_GLANCE_ACCESSIBLE: undefined,
      TERM: "xterm-256color",
    });

    assert.equal(result.code, 130, result.output);
    assert.equal(
      result.output.includes(`${String.fromCodePoint(27)}[?25l`),
      true,
    );
    assert.equal(
      result.output.includes(`${String.fromCodePoint(27)}[?25h`),
      true,
    );
    await assert.rejects(
      () => readFile(path.join(home, ".claude", "settings.json"), "utf8"),
      /ENOENT/u,
    );
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
send "\\r"
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

async function runExpectArrowPty(
  home: string,
  runner: string,
  environment: Record<string, string | undefined>,
): Promise<{ code: number | null; output: string }> {
  const expectScript = path.join(home, "arrow-setup.exp");
  await writeFile(
    expectScript,
    `#!/usr/bin/expect -f
set timeout 20
spawn [lindex $argv 0]
expect {*How would you like to continue?*}
send "\\033\\[B\\r"
expect {*Select provider integrations*}
send "\\r"
expect {*Select Side Glance computer notifications*}
send " \\r"
expect {*How should new terminal tabs start?*}
send "\\r"
expect {*What should colors communicate?*}
send "\\033\\[B\\r"
expect {*How should Heat set its ceiling?*}
send "\\r"
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
  environment: Record<string, string | undefined>,
  interactions: readonly { prompt: string; answer: string }[],
): Promise<{ code: number | null; output: string }> {
  return runProcess("/usr/bin/script", args, environment, interactions);
}

function runProcess(
  executable: string,
  args: readonly string[],
  environment: Record<string, string | undefined>,
  interactions?: readonly { prompt: string; answer: string }[],
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      env: childEnvironment(environment),
      stdio: [interactions === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let output = "";
    let interactionIndex = 0;
    let searchOffset = 0;
    const drive = () => {
      while (interactions && interactionIndex < interactions.length) {
        const interaction = interactions[interactionIndex];
        if (!interaction) return;
        const promptIndex = output.indexOf(interaction.prompt, searchOffset);
        if (promptIndex < 0) return;
        searchOffset = promptIndex + interaction.prompt.length;
        child.stdin?.write(interaction.answer);
        interactionIndex += 1;
      }
    };
    const timeout = setTimeout(() => child.kill("SIGTERM"), 20_000);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      output += chunk;
      drive();
    });
    child.stderr?.on("data", (chunk: string) => {
      output += chunk;
      drive();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, output });
    });
  });
}

function childEnvironment(
  overrides: Record<string, string | undefined>,
): NodeJS.ProcessEnv {
  const environment = { ...process.env, ...overrides };
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete environment[key];
  }
  return environment;
}

async function runSignalPty(
  home: string,
  runner: string,
  runnerPid: string,
  environment: Record<string, string | undefined>,
): Promise<{ code: number | null; output: string }> {
  let executable = "/usr/bin/script";
  let args = ["-qec", runner, "/dev/null"];
  if (process.platform === "darwin") {
    const expectScript = path.join(home, "signal-setup.exp");
    await writeFile(
      expectScript,
      `#!/usr/bin/expect -f
set timeout 20
spawn [lindex $argv 0]
expect eof
set result [wait]
exit [lindex $result 3]
`,
      { mode: 0o700 },
    );
    executable = "/usr/bin/expect";
    args = [expectScript, runner];
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env: childEnvironment(environment),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let signalled = false;
    const signalPrompt = async () => {
      if (signalled || !output.includes("How would you like to continue?")) return;
      signalled = true;
      const pid = Number.parseInt(await readFile(runnerPid, "utf8"), 10);
      process.kill(pid, "SIGINT");
    };
    const timeout = setTimeout(() => child.kill("SIGTERM"), 20_000);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      output += chunk;
      void signalPrompt().catch(reject);
    });
    child.stderr?.on("data", (chunk: string) => {
      output += chunk;
      void signalPrompt().catch(reject);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, output });
    });
  });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
