import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ANALYTICS_EVENTS,
  claimDemoEngagement,
} from "../../app/lib/analytics-events.ts";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("defines the three decision events and claims demo engagement once per tab session", () => {
  assert.deepEqual(ANALYTICS_EVENTS, {
    demoEngaged: "demo_engaged",
    githubOpened: "github_opened",
    installCommandCopied: "install_command_copied",
  });

  const storage = new MemoryStorage();
  assert.equal(claimDemoEngagement(storage), true);
  assert.equal(claimDemoEngagement(storage), false);
});

test("uses Vercel for custom events and leaves sideglance.dev Cloudflare RUM automatic", async () => {
  const [
    packageSource,
    layout,
    installButton,
    githubAction,
    showcase,
    terminal,
    privacy,
    docs,
  ] = await Promise.all([
    readFile("package.json", "utf8"),
    readFile("app/layout.tsx", "utf8"),
    readFile("app/components/InstallButton.tsx", "utf8"),
    readFile("app/components/GitHubAction.tsx", "utf8"),
    readFile("app/components/TerminalShowcase.tsx", "utf8"),
    readFile("app/components/InteractiveClaudeTerminal.tsx", "utf8"),
    readFile("app/lib/agent-content.ts", "utf8"),
    readFile("docs/analytics.md", "utf8"),
  ]);
  const packageManifest = JSON.parse(packageSource) as {
    dependencies: Record<string, string>;
    scripts: Record<string, string>;
  };

  assert.ok(packageManifest.dependencies["@vercel/analytics"]);
  assert.equal(
    packageManifest.scripts["analytics:adoption"],
    "node scripts/analytics/adoption-report.mjs"
  );
  assert.match(
    layout,
    /import \{ Analytics \} from "@vercel\/analytics\/next"/u
  );
  assert.match(layout, /<Analytics\s*\/>/u);
  assert.doesNotMatch(layout, /NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN/u);
  assert.doesNotMatch(
    layout,
    /static\.cloudflareinsights\.com\/beacon\.min\.js/u
  );

  assert.match(
    installButton,
    /navigator\.clipboard\.writeText\(INSTALL_COMMAND\)[\s\S]*trackInstallCommandCopied\(\)/u
  );
  assert.match(githubAction, /trackGitHubOpened/u);
  assert.match(githubAction, /onClick=\{trackGitHubOpened\}/u);
  assert.match(showcase, /trackDemoEngaged/u);
  assert.match(showcase, /selectAppearance/u);
  assert.match(terminal, /trackDemoEngaged\("terminal_input"\)/u);
  assert.match(terminal, /Prompt text stays in this tab/u);
  assert.doesNotMatch(showcase, /onKeyDownCapture|onPointerDownCapture/u);

  assert.match(privacy, /Vercel Web Analytics/u);
  assert.match(privacy, /prompt text/u);
  assert.match(privacy, /sessionStorage/u);

  assert.match(docs, /August 27, 2026/u);
  assert.match(docs, /Do not combine/u);
  assert.match(docs, /Homebrew install-on-request/u);
});
