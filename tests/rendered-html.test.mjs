import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

async function render() {
  const html = await readFile(
    new URL("../.next/server/app/index.html", import.meta.url),
    "utf8"
  );
  return new Response(html, { headers: { "content-type": "text/html" } });
}

function renderedText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

test("server-renders the focused Side Glance launch hero", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const text = renderedText(html);
  assert.match(
    html,
    /<title>Side Glance — Long loops\. Short glances\.<\/title>/i
  );
  assert.match(
    html,
    /<meta name="description" content="Side Glance is a local-first attention layer for coding-agent CLIs\. See working, waiting, ready, and failed state in your terminal or tmux\."\/>/i
  );
  assert.match(text, /Long loops\. Short glances\./);
  assert.match(text, /Know which loop needs judgment\./);
  assert.match(text, /Let the others keep running\./);
  assert.match(text, /What Side Glance does/);
  assert.match(text, /When Side Glance helps/);
  assert.match(text, /How it fits your workflow/);
  assert.ok(
    text.length >= 500,
    `raw homepage text is only ${text.length} chars`
  );
  assert.equal(html.match(/<h1\b/gu)?.length, 1);
  assert.ok((html.match(/<h2\b/gu)?.length ?? 0) >= 3);
  assert.ok(
    html.indexOf("<h1") < html.indexOf("<h2"),
    "the H1 must precede supporting H2 sections"
  );
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/sideglance\.dev"\/>/i
  );
  const jsonLdMatch = html.match(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/iu
  );
  assert.ok(jsonLdMatch, "missing server-rendered JSON-LD");
  const jsonLd = JSON.parse(jsonLdMatch[1]);
  assert.deepEqual(
    jsonLd["@graph"].map((entry) => entry["@type"]),
    ["Organization", "WebSite", "SoftwareApplication"]
  );
  const [organization] = jsonLd["@graph"];
  assert.equal(organization.name, "Design From, Inc.");
  assert.equal(organization.email, "andrew@designfrom.com");
  assert.deepEqual(organization.address, {
    "@type": "PostalAddress",
    addressCountry: "US",
    addressLocality: "New York",
    addressRegion: "NY",
  });
  assert.match(
    html,
    /<link href="\/\.well-known\/ai-catalog\.json" rel="ai-catalog" type="application\/json"\/>/iu
  );
  assert.match(text, /Install/);
  assert.match(
    html,
    /install with Homebrew and run guided setup · public beta · v0\.1/
  );
  assert.match(text, /Claude Code/);
  assert.match(text, /Opus 5 \(1M context\)/);
  assert.match(
    text,
    /Reconcile shared tmux ownership and run the full release suite\./
  );
  assert.match(text, /Ownership reconciliation is complete\./);
  assert.doesNotMatch(text, /Test failed/);
  assert.match(text, /Prompt text stays in this tab · never sent or saved/);
  assert.match(html, /Add a follow-up/);
  assert.doesNotMatch(html, /hero-terminal\.png/);
  assert.match(html, /side-glance-mark\.svg/);
  assert.doesNotMatch(html, /Try Side Glance/);
  assert.doesNotMatch(html, /Recovery, not magic/);
  assert.doesNotMatch(html, /Frequently asked questions/);
  assert.doesNotMatch(text, /\bSignal\b|terminal-signal/);
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
              import.meta.url
            )
          ),
          "utf8"
        )
      )
    )
  ).join("\n");
  assert.doesNotMatch(loadedJavaScript, /Manage MCP & Webhooks/);
  assert.doesNotMatch(loadedJavaScript, /data-agentation-theme/);
  assert.match(loadedJavaScript, /get-side-glance-install-command/);
  assert.match(loadedJavaScript, /get-side-glance-project-info/);
});

test("server-renders substantive trust pages", async () => {
  await Promise.all(
    [
      ["about", "About Side Glance"],
      ["contact", "Contact and support"],
      ["privacy", "Privacy"],
    ].map(async ([route, heading]) => {
      const html = await readFile(
        new URL(`../.next/server/app/${route}.html`, import.meta.url),
        "utf8"
      );
      const text = renderedText(html);

      assert.match(html, new RegExp(`<h1[^>]*>${heading}</h1>`, "iu"));
      assert.match(text, /Install/u);
      assert.match(html, /aria-label="View Side Glance on GitHub"/u);
      assert.ok(
        text.length >= 500,
        `${route} raw HTML text is only ${text.length} chars`
      );
      assert.ok((html.match(/<h2\b/gu)?.length ?? 0) >= 3);
      assert.match(
        html,
        new RegExp(
          `<link rel="canonical" href="https:\\/\\/sideglance\\.dev\\/${route}"\\/>`,
          "iu"
        )
      );
      if (route === "about") {
        assert.match(text, /originated at Design From, Inc\./u);
      }
      if (route === "contact") {
        assert.match(text, /andrew@designfrom\.com/u);
      }
    })
  );
});

test("keeps the focused site accessible, responsive, and product-safe", async () => {
  const [page, siteHeader, showcase, terminal, css, layout] = await Promise.all(
    [
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/components/SiteHeader.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../app/components/TerminalShowcase.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL(
          "../app/components/InteractiveClaudeTerminal.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    ]
  );

  assert.match(siteHeader, /aria-label="Side Glance home"/);
  assert.match(
    siteHeader,
    /idleAriaLabel="install with Homebrew and run guided setup/u
  );
  assert.match(page, /<TerminalShowcase\s*\/>/);
  assert.match(
    showcase,
    /<InteractiveClaudeTerminal\s+appearance=\{appearance\}\s+elapsedSeconds=\{activeState\.elapsedSeconds\}\s+phase=\{phase\}\s+scenario=\{activeState\.scenario\}\s+terminalId=\{activeState\.terminalId\}\s*\/>/
  );
  assert.match(showcase, /aria-pressed=\{activeState\.id === state\.id\}/);
  assert.match(terminal, /Interactive Claude session/);
  assert.match(terminal, /aria-label="Sample agent conversation"/);
  assert.match(terminal, /visualForPhase\(phase, elapsedSeconds, appearance\)/);
  assert.match(terminal, /name="follow-up"/);
  assert.doesNotMatch(terminal, /\bfetch\s*\(/);
  assert.match(css, /background:\s*var\(--terminal-current-wash\)/);
  assert.doesNotMatch(page, /hero-terminal\.png/);
  assert.doesNotMatch(page, /<SideGlancePlayground/);
  assert.doesNotMatch(page, /<TerminalStoryboard/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(
    css,
    /\.minimal-home\s*\{[\s\S]*min-height:\s*calc\(100dvh - var\(--spacing-site-header\)\)/u
  );
  assert.match(layout, /metadataBase/);
  assert.match(layout, /openGraph/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview/);
  assert.doesNotMatch(
    await readFile(import.meta.filename, "utf8"),
    /dist\/server\/index\.js/
  );
});
