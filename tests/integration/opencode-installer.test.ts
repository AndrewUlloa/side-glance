import assert from "node:assert/strict";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import {
  installOpenCodePlugin,
  openCodePluginPath,
  uninstallOpenCodePlugin,
} from "../../src/adapters/opencode-installer.ts";

async function fixtureHome(context: test.TestContext): Promise<string> {
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-opencode-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  return home;
}

async function executableFixture(home: string): Promise<string> {
  const executable = path.join(home, "durable bin", "side-glance");
  await mkdir(path.dirname(executable), { recursive: true });
  await writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  await chmod(executable, 0o700);
  return executable;
}

async function capturingExecutable(
  home: string,
  capturePath: string,
): Promise<string> {
  const executablePath = path.join(home, "capture bin", "side-glance");
  await mkdir(path.dirname(executablePath), { recursive: true });
  await writeFile(
    executablePath,
    `#!/usr/bin/env node\nimport { appendFileSync } from "node:fs";\nconst chunks = [];\nfor await (const chunk of process.stdin) chunks.push(chunk);\nappendFileSync(${JSON.stringify(capturePath)}, JSON.stringify({ argv: process.argv.slice(2), stdin: Buffer.concat(chunks).toString("utf8") }) + "\\n");\n`,
    { mode: 0o700 },
  );
  await chmod(executablePath, 0o700);
  return executablePath;
}

async function loadGeneratedPlugin(
  home: string,
  executablePath: string,
): Promise<{
  event: (input: { event: unknown }) => Promise<void>;
}> {
  await mkdir(path.join(home, ".config", "opencode"), { recursive: true });
  await writeFile(
    path.join(home, ".config", "opencode", "package.json"),
    '{"type":"module"}\n',
  );
  const installed = await installOpenCodePlugin({
    homeDirectory: home,
    executablePath,
  });
  const imported = (await import(
    `${pathToFileURL(installed.configPath).href}?test=${Date.now()}-${Math.random()}`
  )) as {
    SideGlancePlugin: (context?: unknown) => Promise<{
      event: (input: { event: unknown }) => Promise<void>;
    }>;
  };
  return imported.SideGlancePlugin();
}

async function capturedInvocations(
  capturePath: string,
): Promise<Array<{ argv: string[]; stdin: string }>> {
  try {
    return (await readFile(capturePath, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  }
}

test("installs one private OpenCode plugin idempotently without touching native or unrelated files", async (context) => {
  const home = await fixtureHome(context);
  const executablePath = await executableFixture(home);
  const configDirectory = path.join(home, ".config", "opencode");
  const pluginsDirectory = path.join(configDirectory, "plugins");
  const tuiPath = path.join(configDirectory, "tui.json");
  const unrelatedPath = path.join(pluginsDirectory, "personal.js");
  await mkdir(pluginsDirectory, { recursive: true });
  await writeFile(tuiPath, "{\n  \"attention\": {\"volume\": 0.7}\n}\n");
  await writeFile(unrelatedPath, "export const Personal = () => ({})\n");

  const first = await installOpenCodePlugin({
    homeDirectory: home,
    executablePath,
  });
  const installed = await readFile(first.configPath, "utf8");
  const second = await installOpenCodePlugin({
    homeDirectory: home,
    executablePath,
  });

  assert.deepEqual(first, {
    provider: "opencode",
    configPath: openCodePluginPath(home),
    changed: true,
    installedHooks: 1,
  });
  assert.equal(second.changed, false);
  assert.equal(await readFile(first.configPath, "utf8"), installed);
  assert.equal(
    await readFile(tuiPath, "utf8"),
    "{\n  \"attention\": {\"volume\": 0.7}\n}\n",
  );
  assert.equal(
    await readFile(unrelatedPath, "utf8"),
    "export const Personal = () => ({})\n",
  );
  assert.equal((await lstat(first.configPath)).mode & 0o777, 0o600);
  assert.deepEqual((await readdir(pluginsDirectory)).sort(), [
    "personal.js",
    "side-glance.js",
  ]);

  assert.match(installed, /from "node:child_process"/u);
  assert.match(installed, /spawn\(/u);
  assert.match(installed, /shell: false/u);
  assert.match(installed, /child\.stdin\.end\(payload\)/u);
  assert.match(installed, /JSON\.stringify\(event\)/u);
  assert.match(installed, new RegExp(JSON.stringify(executablePath).replaceAll("\\", "\\\\"), "u"));
  assert.match(
    installed,
    /\["hook","--provider","opencode","--notifications","--json"\]/u,
  );
  assert.doesNotMatch(installed, /\$`|exec\(|execFile\(|shell:\s*true/u);
});

test("generated plugin forwards the exact event as JSON using argv including a validated sound", async (context) => {
  const home = await fixtureHome(context);
  const capturePath = path.join(home, "capture.json");
  const executablePath = path.join(home, "durable bin", "side-glance");
  await mkdir(path.dirname(executablePath), { recursive: true });
  await writeFile(
    executablePath,
    `#!/usr/bin/env node\nimport { writeFileSync } from "node:fs";\nconst chunks = [];\nfor await (const chunk of process.stdin) chunks.push(chunk);\nwriteFileSync(${JSON.stringify(capturePath)}, JSON.stringify({ argv: process.argv.slice(2), stdin: Buffer.concat(chunks).toString("utf8") }));\n`,
    { mode: 0o700 },
  );
  await chmod(executablePath, 0o700);
  await mkdir(path.join(home, ".config", "opencode"), { recursive: true });
  await writeFile(
    path.join(home, ".config", "opencode", "package.json"),
    '{"type":"module"}\n',
  );

  const installed = await installOpenCodePlugin({
    homeDirectory: home,
    executablePath,
    notificationSound: "Glass Bell",
  });
  const imported = (await import(`${pathToFileURL(installed.configPath).href}?test=${Date.now()}`)) as {
    SideGlancePlugin: () => Promise<{
      event: (input: { event: unknown }) => Promise<void>;
    }>;
  };
  const plugin = await imported.SideGlancePlugin();
  const event = {
    type: "session.created",
    properties: {
      info: { id: "opencode-session", ignored: "opaque payload" },
    },
  };
  await plugin.event({ event });
  const capture = JSON.parse(await readFile(capturePath, "utf8"));

  assert.deepEqual(capture.argv, [
    "hook",
    "--provider",
    "opencode",
    "--notifications",
    "--notification-sound",
    "Glass Bell",
    "--json",
  ]);
  assert.deepEqual(JSON.parse(capture.stdin), event);
});

test("generated plugin suppresses every child event using session event info and cache", async (context) => {
  const home = await fixtureHome(context);
  const capturePath = path.join(home, "captured.ndjson");
  const executablePath = await capturingExecutable(home, capturePath);
  const plugin = await loadGeneratedPlugin(home, executablePath);

  await plugin.event({
    event: {
      type: "session.created",
      properties: {
        info: {
          id: "child-session",
          parentID: "top-session",
          title: "secret child task title",
        },
      },
    },
  });
  await plugin.event({
    event: {
      type: "session.idle",
      properties: { sessionID: "child-session" },
    },
  });
  await plugin.event({
    event: {
      type: "session.status",
      properties: {
        sessionID: "child-session",
        status: { type: "busy" },
      },
    },
  });
  await plugin.event({
    event: {
      type: "permission.asked",
      properties: { sessionID: "child-session" },
    },
  });
  await plugin.event({
    event: {
      type: "permission.replied",
      properties: { sessionID: "child-session" },
    },
  });
  await plugin.event({
    event: {
      type: "session.error",
      properties: { sessionID: "child-session" },
    },
  });
  await plugin.event({
    event: {
      type: "session.deleted",
      properties: {
        info: { id: "child-session", parentID: "top-session" },
      },
    },
  });
  await plugin.event({
    event: {
      type: "session.created",
      properties: {
        info: { id: "top-session", title: "secret top prompt title" },
      },
    },
  });
  await plugin.event({
    event: {
      type: "session.idle",
      properties: { sessionID: "top-session" },
    },
  });

  const captures = await capturedInvocations(capturePath);
  assert.deepEqual(
    captures.map(({ stdin }) => {
      const event = JSON.parse(stdin);
      return [event.type, event.properties.sessionID ?? event.properties.info?.id];
    }),
    [
      ["session.created", "top-session"],
      ["session.idle", "top-session"],
    ],
  );
  assert.ok(
    captures.every(({ argv }) =>
      argv.every((argument) => !argument.includes("secret")),
    ),
  );
});

test("generated plugin uses the official client lookup once per unknown session and fails closed", async (context) => {
  const home = await fixtureHome(context);
  const capturePath = path.join(home, "captured.ndjson");
  const executablePath = await capturingExecutable(home, capturePath);
  await mkdir(path.join(home, ".config", "opencode"), { recursive: true });
  await writeFile(
    path.join(home, ".config", "opencode", "package.json"),
    '{"type":"module"}\n',
  );
  const installed = await installOpenCodePlugin({
    homeDirectory: home,
    executablePath,
  });
  const imported = (await import(
    `${pathToFileURL(installed.configPath).href}?lookup=${Date.now()}`
  )) as {
    SideGlancePlugin: (context: unknown) => Promise<{
      event: (input: { event: unknown }) => Promise<void>;
    }>;
  };
  const lookups: unknown[] = [];
  const plugin = await imported.SideGlancePlugin({
    client: {
      session: {
        get: async (options: unknown) => {
          lookups.push(options);
          const id = (options as { path?: { id?: string } }).path?.id;
          if (id === "looked-up-child") {
            return {
              data: {
                id,
                parentID: "top-session",
                title: "private subagent prompt",
              },
            };
          }
          if (id === "looked-up-top") {
            return { data: { id, title: "private top-level prompt" } };
          }
          throw new Error("lookup unavailable");
        },
      },
    },
  });

  for (const sessionID of [
    "looked-up-child",
    "looked-up-child",
    "looked-up-top",
    "lookup-failed",
  ]) {
    await plugin.event({
      event: { type: "session.idle", properties: { sessionID } },
    });
  }

  assert.deepEqual(lookups, [
    { path: { id: "looked-up-child" } },
    { path: { id: "looked-up-top" } },
    { path: { id: "lookup-failed" } },
  ]);
  const captures = await capturedInvocations(capturePath);
  assert.deepEqual(
    captures.map(({ stdin }) => JSON.parse(stdin).properties.sessionID),
    ["looked-up-top"],
  );
  assert.ok(
    captures.every(({ argv }) =>
      argv.every((argument) => !argument.includes("private")),
    ),
  );
});

test("generated plugin preserves top-level permission and error events without leaking private fields into argv", async (context) => {
  const home = await fixtureHome(context);
  const capturePath = path.join(home, "captured.ndjson");
  const executablePath = await capturingExecutable(home, capturePath);
  const plugin = await loadGeneratedPlugin(home, executablePath);
  const created = {
    type: "session.created",
    properties: {
      info: { id: "child-session", parentID: "top-session" },
    },
  };
  const permission = {
    type: "permission.asked",
    properties: {
      sessionID: "child-session",
      title: "private permission title",
      prompt: "private prompt body",
    },
  };
  const failure = {
    type: "session.error",
    properties: {
      sessionID: "child-session",
      error: { message: "private model response" },
    },
  };
  await plugin.event({ event: created });
  await plugin.event({ event: permission });
  await plugin.event({ event: failure });
  await plugin.event({
    event: {
      type: "session.idle",
      properties: { sessionID: "child-session" },
    },
  });
  const topCreated = {
    type: "session.created",
    properties: { info: { id: "top-session" } },
  };
  const topPermission = {
    ...permission,
    properties: { ...permission.properties, sessionID: "top-session" },
  };
  const topFailure = {
    ...failure,
    properties: { ...failure.properties, sessionID: "top-session" },
  };
  await plugin.event({ event: topCreated });
  await plugin.event({ event: topPermission });
  await plugin.event({ event: topFailure });

  const captures = await capturedInvocations(capturePath);
  assert.deepEqual(
    captures.map(({ stdin }) => JSON.parse(stdin).type),
    ["session.created", "permission.asked", "session.error"],
  );
  assert.deepEqual(JSON.parse(captures[0].stdin), topCreated);
  assert.deepEqual(JSON.parse(captures[1].stdin), topPermission);
  assert.deepEqual(JSON.parse(captures[2].stdin), topFailure);
  assert.ok(
    captures.every(({ argv }) =>
      argv.every(
        (argument) =>
          !argument.includes("permission title") &&
          !argument.includes("prompt body") &&
          !argument.includes("model response"),
      ),
    ),
  );
});

test("generated plugin updates child cache without spawning for unsupported events", async (context) => {
  const home = await fixtureHome(context);
  const capturePath = path.join(home, "captured.ndjson");
  const executablePath = await capturingExecutable(home, capturePath);
  const plugin = await loadGeneratedPlugin(home, executablePath);

  await plugin.event({
    event: {
      type: "session.updated",
      properties: {
        info: {
          id: "updated-child",
          parentID: "top-session",
          title: "private updated title",
        },
      },
    },
  });
  await plugin.event({
    event: {
      type: "message.updated",
      properties: {
        info: { sessionID: "updated-child", text: "private prompt text" },
      },
    },
  });
  await plugin.event({
    event: {
      type: "session.status",
      properties: {
        sessionID: "updated-child",
        status: { type: "idle" },
      },
    },
  });
  await plugin.event({
    event: {
      type: "session.idle",
      properties: { sessionID: "updated-child" },
    },
  });

  assert.deepEqual(await capturedInvocations(capturePath), []);
});

test("generated plugin bounds a hung hook child and returns control to OpenCode", async (context) => {
  const home = await fixtureHome(context);
  const executablePath = path.join(home, "hung bin", "side-glance");
  const pidPath = path.join(home, "hung-child.pid");
  await mkdir(path.dirname(executablePath), { recursive: true });
  await writeFile(
    executablePath,
    `#!/usr/bin/env node\nimport { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(pidPath)}, String(process.pid));\nprocess.on("SIGTERM", () => {});\nsetInterval(() => {}, 1_000);\n`,
    { mode: 0o700 },
  );
  await chmod(executablePath, 0o700);
  const plugin = await loadGeneratedPlugin(home, executablePath);

  context.after(async () => {
    const pid = Number(await readFile(pidPath, "utf8").catch(() => "0"));
    if (!pid) return;
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The generated plugin already reaped the timed-out child.
    }
  });

  const startedAt = Date.now();
  await plugin.event({
    event: {
      type: "session.created",
      properties: { info: { id: "top-session" } },
    },
  });
  const elapsed = Date.now() - startedAt;
  const pid = Number(await readFile(pidPath, "utf8"));

  assert.ok(elapsed >= 1_500, `hook resolved too early after ${elapsed}ms`);
  assert.ok(elapsed < 4_000, `hook remained blocked for ${elapsed}ms`);
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
});

test("validates sound before writing and never treats it as program text", async (context) => {
  const home = await fixtureHome(context);
  const executablePath = await executableFixture(home);

  for (const sound of ["", "   ", "--json", "../Glass", "Bell\nInjected"]) {
    await assert.rejects(
      () =>
        installOpenCodePlugin({
          homeDirectory: home,
          executablePath,
          notificationSound: sound,
        }),
      /sound/i,
    );
  }
  await assert.rejects(
    () =>
      installOpenCodePlugin({
        homeDirectory: home,
        executablePath,
        notificationSound: "x".repeat(65),
      }),
    /sound/i,
  );
  await assert.rejects(() => readFile(openCodePluginPath(home)), /ENOENT/u);
});

test("replaces an owned legacy plugin with a private backup and uninstall removes only the owned file", async (context) => {
  const home = await fixtureHome(context);
  const executablePath = await executableFixture(home);
  const pluginPath = openCodePluginPath(home);
  const unrelatedPath = path.join(path.dirname(pluginPath), "personal.js");
  await mkdir(path.dirname(pluginPath), { recursive: true });
  const legacy = "// SIGNAL_MANAGED_OPENCODE_PLUGIN=1\nexport const Legacy = () => ({})\n";
  await writeFile(pluginPath, legacy, { mode: 0o644 });
  await writeFile(unrelatedPath, "personal\n");

  const installed = await installOpenCodePlugin({
    homeDirectory: home,
    executablePath,
  });
  assert.equal(installed.changed, true);
  assert.ok(installed.backupPath);
  assert.equal(await readFile(installed.backupPath, "utf8"), legacy);
  assert.equal((await lstat(installed.backupPath)).mode & 0o777, 0o600);

  const uninstalled = await uninstallOpenCodePlugin({
    homeDirectory: home,
    executablePath,
  });
  assert.equal(uninstalled.changed, true);
  await assert.rejects(() => readFile(pluginPath), /ENOENT/u);
  assert.equal(await readFile(unrelatedPath, "utf8"), "personal\n");

  const again = await uninstallOpenCodePlugin({
    homeDirectory: home,
    executablePath,
  });
  assert.equal(again.changed, false);
});

test("refuses symlinked, non-file, unrelated, and malformed managed targets", async (context) => {
  const home = await fixtureHome(context);
  const executablePath = await executableFixture(home);
  const pluginPath = openCodePluginPath(home);
  await mkdir(path.dirname(pluginPath), { recursive: true });
  const outside = path.join(home, "outside.js");
  await writeFile(outside, "outside\n");
  await symlink(outside, pluginPath);

  await assert.rejects(
    () => installOpenCodePlugin({ homeDirectory: home, executablePath }),
    /symbolic link/i,
  );
  assert.equal(await readFile(outside, "utf8"), "outside\n");

  await rm(pluginPath);
  await mkdir(pluginPath);
  await assert.rejects(
    () => installOpenCodePlugin({ homeDirectory: home, executablePath }),
    /regular file/i,
  );

  await rm(pluginPath, { recursive: true });
  await writeFile(pluginPath, "export const Personal = () => ({})\n");
  await assert.rejects(
    () => installOpenCodePlugin({ homeDirectory: home, executablePath }),
    /not owned/i,
  );
  const unrelatedRemoval = await uninstallOpenCodePlugin({
    homeDirectory: home,
    executablePath,
  });
  assert.equal(unrelatedRemoval.changed, false);
  assert.equal(await readFile(pluginPath, "utf8"), "export const Personal = () => ({})\n");

  await writeFile(
    pluginPath,
    "// SIDE_GLANCE_MANAGED_OPENCODE_PLUGIN=1\n// malformed manifest\n",
  );
  await assert.rejects(
    () => installOpenCodePlugin({ homeDirectory: home, executablePath }),
    /malformed/i,
  );
});

test("refuses symlinked plugin directories and invalid executable locations", async (context) => {
  const home = await fixtureHome(context);
  const executablePath = await executableFixture(home);
  const opencodeDirectory = path.join(home, ".config", "opencode");
  const outsideDirectory = path.join(home, "outside-plugins");
  await mkdir(opencodeDirectory, { recursive: true });
  await mkdir(outsideDirectory);
  await symlink(outsideDirectory, path.join(opencodeDirectory, "plugins"));

  await assert.rejects(
    () => installOpenCodePlugin({ homeDirectory: home, executablePath }),
    /symbolic link/i,
  );
  assert.deepEqual(await readdir(outsideDirectory), []);

  await assert.rejects(
    () =>
      installOpenCodePlugin({
        homeDirectory: "relative-home",
        executablePath,
      }),
    /absolute/i,
  );
  await assert.rejects(
    () =>
      installOpenCodePlugin({
        homeDirectory: home,
        executablePath: "relative-side-glance",
      }),
    /absolute/i,
  );
});
