"use client";

import { track } from "@vercel/analytics";

export const ANALYTICS_EVENTS = {
  demoEngaged: "demo_engaged",
  githubOpened: "github_opened",
  installCommandCopied: "install_command_copied",
} as const;

const DEMO_ENGAGEMENT_SESSION_KEY = "side-glance:demo-engaged";

interface AnalyticsStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export type DemoEngagementInteraction =
  | "color_model"
  | "lifecycle"
  | "terminal_input";

let demoEngagementClaimedInMemory = false;

export function claimDemoEngagement(storage: AnalyticsStorage) {
  try {
    if (storage.getItem(DEMO_ENGAGEMENT_SESSION_KEY)) {
      return false;
    }
    storage.setItem(DEMO_ENGAGEMENT_SESSION_KEY, "1");
    return true;
  } catch {
    return true;
  }
}

export function trackInstallCommandCopied() {
  trackSafely(ANALYTICS_EVENTS.installCommandCopied, { method: "homebrew" });
}

export function trackGitHubOpened() {
  trackSafely(ANALYTICS_EVENTS.githubOpened, { location: "header" });
}

export function trackDemoEngaged(interaction: DemoEngagementInteraction) {
  if (demoEngagementClaimedInMemory) {
    return;
  }

  const storage = getSessionStorage();
  if (storage && !claimDemoEngagement(storage)) {
    demoEngagementClaimedInMemory = true;
    return;
  }

  demoEngagementClaimedInMemory = true;
  trackSafely(ANALYTICS_EVENTS.demoEngaged, { interaction });
}

function getSessionStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function trackSafely(
  event: (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS],
  properties: Record<string, string>
) {
  try {
    track(event, properties);
  } catch {
    // Analytics blockers and unavailable browser APIs must never break the UI.
  }
}
