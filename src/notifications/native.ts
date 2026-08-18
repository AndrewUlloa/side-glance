import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

import {
  notificationRequestForEvent,
  type EventNotifier,
  type NotificationOptions,
  type NotificationRequest,
} from "./policy.ts";

const execFileAsync = promisify(execFile);
const APPLE_NOTIFICATION_SCRIPT = `on run argv
set notificationTitle to item 1 of argv
set notificationBody to item 2 of argv
set notificationSound to item 3 of argv
display notification notificationBody with title notificationTitle sound name notificationSound
end run`;

export type ExecFileRunner = (
  file: string,
  args: readonly string[],
) => Promise<void>;

export interface NativeNotifierDependencies {
  platform?: NodeJS.Platform;
  execFile?: ExecFileRunner;
  commandExists?: (command: string) => Promise<boolean>;
}

export function createNativeNotifier(
  options: NotificationOptions = {},
  dependencies: NativeNotifierDependencies = {},
): EventNotifier {
  const platform = dependencies.platform ?? process.platform;
  const run = dependencies.execFile ?? runExecFile;
  const commandExists = dependencies.commandExists ?? commandExistsOnPath;

  return {
    async notify(event): Promise<void> {
      const request = notificationRequestForEvent(event, options);
      if (!request) return;

      try {
        if (platform === "darwin") {
          await notifyMacOs(request, run);
        } else if (
          platform === "linux" &&
          (await commandExists("notify-send"))
        ) {
          await notifyLinux(request, run);
        }
      } catch {
        // Desktop notification availability must never affect lifecycle state.
      }
    },
  };
}

async function notifyMacOs(
  request: NotificationRequest,
  run: ExecFileRunner,
): Promise<void> {
  await run("/usr/bin/osascript", [
    "-e",
    APPLE_NOTIFICATION_SCRIPT,
    request.title,
    request.body,
    request.sound,
  ]);
}

async function notifyLinux(
  request: NotificationRequest,
  run: ExecFileRunner,
): Promise<void> {
  await run("notify-send", [
    "--app-name",
    "Side Glance",
    "--hint",
    `string:sound-name:${request.sound}`,
    request.title,
    request.body,
  ]);
}

async function runExecFile(
  file: string,
  args: readonly string[],
): Promise<void> {
  await execFileAsync(file, [...args], {
    timeout: 5_000,
    windowsHide: true,
  });
}

async function commandExistsOnPath(command: string): Promise<boolean> {
  const searchPath = process.env.PATH;
  if (!searchPath) return false;

  for (const directory of searchPath.split(delimiter)) {
    if (!directory) continue;
    try {
      await access(join(directory, command), constants.X_OK);
      return true;
    } catch {
      // Continue looking through PATH.
    }
  }
  return false;
}
