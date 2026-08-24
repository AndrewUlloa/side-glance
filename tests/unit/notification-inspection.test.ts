import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { inspectNotificationReadiness } from "../../src/notifications/inspection.ts";

async function fixtureHome(context: test.TestContext): Promise<string> {
  const home = await mkdtemp(path.join(tmpdir(), "side-glance-notifications-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  return home;
}

test("reports the OS backend separately from configured provider-native notifications", async (context) => {
  const home = await fixtureHome(context);
  await mkdir(path.join(home, ".codex"), { recursive: true });
  await mkdir(path.join(home, ".gemini"), { recursive: true });
  await mkdir(path.join(home, ".config", "opencode"), { recursive: true });
  await writeFile(
    path.join(home, ".codex", "config.toml"),
    [
      'notify = ["existing-notifier"]',
      "[tui]",
      'notifications = ["agent-turn-complete", "approval-requested"]',
      'notification_method = "osc9"',
      'notification_condition = "always"',
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(home, ".gemini", "settings.json"),
    JSON.stringify({
      general: { enableNotifications: true, notificationMethod: "auto" },
    }),
  );
  await writeFile(
    path.join(home, ".config", "opencode", "tui.json"),
    JSON.stringify({
      attention: {
        enabled: true,
        notifications: true,
        sound: true,
        volume: 0.65,
      },
    }),
  );

  const probes: string[] = [];
  const inspection = await inspectNotificationReadiness({
    homeDirectory: home,
    platform: "darwin",
    pathProbe: async (candidate) => {
      probes.push(candidate);
      return ["/usr/bin/osascript", "terminal-notifier", "aider"].includes(
        candidate,
      );
    },
  });

  assert.deepEqual(inspection.sideGlance, {
    platform: "darwin",
    status: "available",
    backend: "osascript",
  });
  assert.deepEqual(inspection.providers.codex, {
    provider: "codex",
    configPath: path.join(home, ".codex", "config.toml"),
    exists: true,
    fileStatus: "regular",
    status: "ready",
    notifications: ["agent-turn-complete", "approval-requested"],
    method: "osc9",
    condition: "always",
    topLevelNotify: true,
  });
  assert.deepEqual(inspection.providers.gemini, {
    provider: "gemini",
    configPath: path.join(home, ".gemini", "settings.json"),
    exists: true,
    fileStatus: "regular",
    status: "ready",
    scope: "user",
    higherPrecedenceOverridesPossible: true,
    enabled: true,
    method: "auto",
  });
  assert.deepEqual(inspection.providers.opencode, {
    provider: "opencode",
    configPath: path.join(home, ".config", "opencode", "tui.json"),
    exists: true,
    fileStatus: "regular",
    status: "ready",
    enabled: true,
    notifications: true,
    sound: true,
    volume: 0.65,
  });
  assert.deepEqual(inspection.providers.aider, {
    provider: "aider",
    status: "ready",
    binaryAvailable: true,
    backend: "terminal-notifier",
  });
  assert.deepEqual(probes, [
    "/usr/bin/osascript",
    "aider",
    "terminal-notifier",
  ]);
});

test("reports malformed relevant configuration as unknown without permissive JSONC parsing", async (context) => {
  const home = await fixtureHome(context);
  await mkdir(path.join(home, ".codex"), { recursive: true });
  await mkdir(path.join(home, ".gemini"), { recursive: true });
  await mkdir(path.join(home, ".config", "opencode"), { recursive: true });
  await writeFile(
    path.join(home, ".codex", "config.toml"),
    "[tui]\nnotifications = definitely\n",
  );
  await writeFile(path.join(home, ".gemini", "settings.json"), "{broken");
  await writeFile(
    path.join(home, ".config", "opencode", "tui.json"),
    '{\n  // JSONC is not silently accepted\n  "attention": {"enabled": true}\n}\n',
  );

  const inspection = await inspectNotificationReadiness({
    homeDirectory: home,
    platform: "darwin",
    pathProbe: async () => false,
  });

  assert.deepEqual(inspection.providers.codex, {
    provider: "codex",
    configPath: path.join(home, ".codex", "config.toml"),
    exists: true,
    fileStatus: "malformed",
    status: "unknown",
    topLevelNotify: false,
  });
  assert.equal(inspection.providers.gemini.fileStatus, "malformed");
  assert.equal(inspection.providers.gemini.exists, true);
  assert.equal(inspection.providers.gemini.status, "unknown");
  assert.equal(inspection.providers.gemini.scope, "user");
  assert.equal(
    inspection.providers.gemini.higherPrecedenceOverridesPossible,
    true,
  );
  assert.equal(inspection.providers.opencode.fileStatus, "malformed");
  assert.equal(inspection.providers.opencode.exists, true);
  assert.equal(inspection.providers.opencode.status, "unknown");
});

test("reports OpenCode desktop notifications from the effective attention toggles", async (context) => {
  const home = await fixtureHome(context);
  const configDirectory = path.join(home, ".config", "opencode");
  const configPath = path.join(configDirectory, "tui.json");
  await mkdir(configDirectory, { recursive: true });

  await writeFile(
    configPath,
    JSON.stringify({
      attention: { enabled: true, notifications: false, sound: false },
    }),
  );
  const disabled = await inspectNotificationReadiness({
    homeDirectory: home,
    platform: "darwin",
    pathProbe: async () => false,
  });
  assert.equal(disabled.providers.opencode.status, "disabled");

  await writeFile(
    configPath,
    JSON.stringify({
      attention: { enabled: true, notifications: false, sound: true },
    }),
  );
  const soundOnly = await inspectNotificationReadiness({
    homeDirectory: home,
    platform: "darwin",
    pathProbe: async () => false,
  });
  assert.equal(soundOnly.providers.opencode.status, "ready");

  await writeFile(
    configPath,
    JSON.stringify({ attention: { enabled: true } }),
  );
  const enabledByDefault = await inspectNotificationReadiness({
    homeDirectory: home,
    platform: "darwin",
    pathProbe: async () => false,
  });
  assert.equal(enabledByDefault.providers.opencode.status, "ready");

  await writeFile(
    configPath,
    JSON.stringify({ attention: { enabled: false, notifications: true } }),
  );
  const masterDisabled = await inspectNotificationReadiness({
    homeDirectory: home,
    platform: "darwin",
    pathProbe: async () => false,
  });
  assert.equal(masterDisabled.providers.opencode.status, "disabled");

  await writeFile(
    configPath,
    JSON.stringify({ attention: { enabled: true, sound: "glass" } }),
  );
  const invalidSound = await inspectNotificationReadiness({
    homeDirectory: home,
    platform: "darwin",
    pathProbe: async () => false,
  });
  assert.equal(invalidSound.providers.opencode.status, "unknown");
});

test("recognizes valid multiline Codex notification arrays", async (context) => {
  const home = await fixtureHome(context);
  await mkdir(path.join(home, ".codex"), { recursive: true });
  await writeFile(
    path.join(home, ".codex", "config.toml"),
    [
      "[tui]",
      "notifications = [",
      '  "agent-turn-complete",',
      '  "approval-requested",',
      "]",
      'notification_method = "auto"',
      "",
    ].join("\n"),
  );

  const inspection = await inspectNotificationReadiness({
    homeDirectory: home,
    platform: "darwin",
    pathProbe: async () => false,
  });

  assert.equal(inspection.providers.codex.fileStatus, "regular");
  assert.equal(inspection.providers.codex.status, "ready");
  assert.deepEqual(inspection.providers.codex.notifications, [
    "agent-turn-complete",
    "approval-requested",
  ]);
});

test("fails closed on symlinked and oversized configuration without writing files", async (context) => {
  const home = await fixtureHome(context);
  await mkdir(path.join(home, ".gemini"), { recursive: true });
  await mkdir(path.join(home, ".config", "opencode"), { recursive: true });
  const outside = path.join(home, "outside-settings.json");
  const outsideContents = JSON.stringify({
    general: { enableNotifications: true },
  });
  await writeFile(outside, outsideContents);
  await symlink(outside, path.join(home, ".gemini", "settings.json"));
  const oversized = path.join(home, ".config", "opencode", "tui.json");
  await writeFile(oversized, "x".repeat(1_048_577));

  const probes: string[] = [];
  const inspection = await inspectNotificationReadiness({
    homeDirectory: home,
    platform: "linux",
    backendHints: { desktopSession: false },
    pathProbe: async (candidate) => {
      probes.push(candidate);
      return candidate === "aider";
    },
  });

  assert.deepEqual(inspection.sideGlance, {
    platform: "linux",
    status: "unavailable",
    backend: null,
  });
  assert.equal(inspection.providers.codex.fileStatus, "absent");
  assert.equal(inspection.providers.codex.status, "ready");
  assert.equal(inspection.providers.codex.effectiveDefault, true);
  assert.equal(inspection.providers.codex.condition, "unfocused");
  assert.equal(inspection.providers.codex.topLevelNotify, false);
  assert.equal(inspection.providers.gemini.fileStatus, "symlink");
  assert.equal(inspection.providers.gemini.status, "unknown");
  assert.equal(inspection.providers.opencode.fileStatus, "oversized");
  assert.equal(inspection.providers.opencode.status, "unknown");
  assert.deepEqual(inspection.providers.aider, {
    provider: "aider",
    status: "unavailable",
    binaryAvailable: true,
    backend: null,
  });
  assert.deepEqual(probes, ["aider"]);
  assert.equal(await readFile(outside, "utf8"), outsideContents);
  assert.equal((await readFile(oversized)).byteLength, 1_048_577);
});
