import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createNativeNotifier } from "../../src/notifications/native.ts";
import {
  DEFAULT_NOTIFICATION_SOUND,
  notificationRequestForEvent,
  sanitizeNotificationLabel,
  sanitizeNotificationSound,
} from "../../src/notifications/policy.ts";
import type { SideGlanceEvent } from "../../src/core/protocol.ts";
import { notificationOptionsForInvocation } from "../../src/cli/index.ts";

interface Execution {
  file: string;
  args: readonly string[];
}

function event(
  kind: SideGlanceEvent["kind"],
  overrides: Partial<SideGlanceEvent> = {},
): SideGlanceEvent {
  return {
    v: 1,
    eventId: `event-${kind}`,
    source: "claude",
    sessionId: "secret/raw/session-id",
    kind,
    occurredAt: 1_000,
    confidence: "native",
    reason: "provider content must never be displayed",
    target: {
      surfaceId: "tty:/private/project-name",
      tty: "/dev/ttys001",
    },
    ...overrides,
  };
}

test("maps only attention events to bounded privacy-safe notification requests", () => {
  for (const kind of [
    "session.started",
    "turn.started",
    "attention.acknowledged",
    "session.ended",
  ] as const) {
    assert.equal(notificationRequestForEvent(event(kind)), undefined);
  }

  const expectedDigest = createHash("sha256")
    .update("secret/raw/session-id")
    .digest("hex")
    .slice(0, 8);
  assert.deepEqual(notificationRequestForEvent(event("turn.completed")), {
    title: "Side Glance · Claude · Ready",
    body: `Session ${expectedDigest}`,
    sound: DEFAULT_NOTIFICATION_SOUND,
  });
  assert.equal(
    JSON.stringify(notificationRequestForEvent(event("turn.completed"))).includes(
      "provider content",
    ),
    false,
  );
  assert.equal(
    JSON.stringify(notificationRequestForEvent(event("turn.completed"))).includes(
      "/private/project-name",
    ),
    false,
  );
  assert.equal(
    JSON.stringify(notificationRequestForEvent(event("turn.completed"))).includes(
      "secret/raw/session-id",
    ),
    false,
  );

  assert.equal(
    notificationRequestForEvent(event("attention.waiting"))?.title,
    "Side Glance · Claude · Needs attention",
  );
  assert.equal(
    notificationRequestForEvent(event("turn.failed"))?.title,
    "Side Glance · Claude · Failed",
  );
  assert.equal(
    notificationRequestForEvent(event("turn.cancelled"))?.title,
    "Side Glance · Claude · Cancelled",
  );
});

test("normalizes, strips controls, and bounds explicit labels and sound names", () => {
  assert.equal(
    sanitizeNotificationLabel("  Cafe\u0301\u0000\n  build   agent  "),
    "Café build agent",
  );
  assert.equal(sanitizeNotificationLabel("x".repeat(80)).length, 48);
  assert.equal(sanitizeNotificationSound("  Hero\u0007  "), "Hero");
  assert.equal(sanitizeNotificationSound("x".repeat(100)).length, 64);

  const request = notificationRequestForEvent(event("turn.completed"), {
    label: "  Frontend\u0000 agent  ",
    sound: "  Glass\u0007  ",
  });
  assert.equal(request?.body, "Frontend agent");
  assert.equal(request?.sound, "Glass");
});

test("lets a wrapper-provided session sound override an installed hook default", () => {
  assert.deepEqual(
    notificationOptionsForInvocation(
      ["--notification-sound", "Glass", "--label", "Installed label"],
      {
        SIDE_GLANCE_NOTIFICATION_SOUND: "Hero",
        SIDE_GLANCE_LABEL: "Wrapper label",
      },
    ),
    { sound: "Hero", label: "Installed label" },
  );
});

test("uses static no-shell osascript arguments on macOS", async () => {
  const executions: Execution[] = [];
  const injection = '"); do shell script "touch /tmp/pwned"; --';
  const notifier = createNativeNotifier(
    { label: injection, sound: "Glass" },
    {
      platform: "darwin",
      execFile: async (file, args) => {
        executions.push({ file, args });
      },
    },
  );

  await notifier.notify(event("turn.completed"));

  assert.equal(executions.length, 1);
  assert.equal(executions[0]?.file, "/usr/bin/osascript");
  assert.equal(executions[0]?.args[0], "-e");
  assert.match(executions[0]?.args[1] ?? "", /display notification/u);
  assert.doesNotMatch(executions[0]?.args[1] ?? "", /touch \/tmp\/pwned/u);
  assert.deepEqual(executions[0]?.args.slice(2), [
    "Side Glance · Claude · Ready",
    injection.slice(0, 48),
    "Glass",
  ]);
});

test("uses notify-send argument vectors on Linux and no-ops when it is missing", async () => {
  const executions: Execution[] = [];
  let available = true;
  const notifier = createNativeNotifier(
    { label: "API agent", sound: "Glass" },
    {
      platform: "linux",
      commandExists: async (command) => {
        assert.equal(command, "notify-send");
        return available;
      },
      execFile: async (file, args) => {
        executions.push({ file, args });
      },
    },
  );

  await notifier.notify(event("attention.waiting", { source: "codex" }));
  assert.deepEqual(executions, [
    {
      file: "notify-send",
      args: [
        "--app-name",
        "Side Glance",
        "--hint",
        "string:sound-name:Glass",
        "Side Glance · Codex · Needs attention",
        "API agent",
      ],
    },
  ]);

  available = false;
  await notifier.notify(event("turn.failed"));
  assert.equal(executions.length, 1);
});

test("unsupported platforms, non-attention events, and delivery errors are non-fatal", async () => {
  let executions = 0;
  const unsupported = createNativeNotifier(
    {},
    {
      platform: "win32",
      execFile: async () => {
        executions += 1;
      },
    },
  );
  await unsupported.notify(event("turn.completed"));
  assert.equal(executions, 0);

  const failing = createNativeNotifier(
    {},
    {
      platform: "darwin",
      execFile: async () => {
        throw new Error("notifications denied");
      },
    },
  );
  await assert.doesNotReject(failing.notify(event("turn.completed")));
  await assert.doesNotReject(failing.notify(event("turn.started")));
});
