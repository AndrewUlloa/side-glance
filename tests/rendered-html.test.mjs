import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

async function render() {
  const html = await readFile(
    new URL("../.next/server/app/index.html", import.meta.url),
    "utf8",
  );
  return new Response(html, { headers: { "content-type": "text/html" } });
}

function renderedText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

test("server-renders Signal's real product and live playground", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const text = renderedText(html);
  assert.match(html, /<title>Signal — attention for coding agents<\/title>/i);
  assert.match(text, /Your terminal knows when it needs you\./);
  assert.match(html, /Try the signal/);
  assert.match(html, /Working/);
  assert.match(html, /Waiting/);
  assert.match(html, /Ready/);
  assert.match(html, /Failed/);
  assert.match(html, /Inactive/);
  assert.match(html, /Claude Code/);
  assert.match(html, /Codex/);
  assert.match(html, /Gemini CLI/);
  assert.match(html, /OpenCode/);
  assert.match(html, /Aider/);
  assert.match(html, /Recovery, not magic/);
  assert.match(html, /Frequently asked questions/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /Manage MCP & Webhooks/);

  const chunkSources = [...html.matchAll(/src="([^"]+\.js)"/g)]
    .map((match) => match[1])
    .filter((source) => source.startsWith("/_next/static/chunks/"));
  const loadedJavaScript = (
    await Promise.all(
      chunkSources.map((source) =>
        readFile(
          fileURLToPath(
            new URL(
              `../.next${source.replace(/^\/_next/, "")}`,
              import.meta.url,
            ),
          ),
          "utf8",
        ),
      ),
    )
  ).join("\n");
  assert.doesNotMatch(loadedJavaScript, /Manage MCP & Webhooks/);
  assert.doesNotMatch(loadedJavaScript, /data-agentation-theme/);
});

test("keeps the site wired to shared phase data and accessible controls", async () => {
  const [page, playground, model, css, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/SignalPlayground.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/playground-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<SignalPlayground/);
  assert.match(playground, /aria-pressed/);
  assert.match(playground, /aria-live="polite"/);
  assert.match(playground, /navigator\.clipboard/);
  assert.match(playground, /type="range"/);
  assert.match(model, /DEFAULT_SIGNAL_THEME/);
  assert.match(model, /urgencyFromElapsed/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(max-width:/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(layout, /metadataBase/);
  assert.match(layout, /openGraph/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview/);
  assert.doesNotMatch(await readFile(import.meta.filename, "utf8"), /dist\/server\/index\.js/);
});
