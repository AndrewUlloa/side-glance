import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("the OG route renders the real long-ready terminal in a 1200 by 630 composition", async () => {
  const [page, css] = await Promise.all([
    read("app/og-image/page.tsx"),
    read("app/og-image/og-image.css"),
  ]);

  assert.match(page, /className="og-image-canvas"/u);
  assert.match(page, /src="\/side-glance-mark\.svg"/u);
  assert.match(page, /Long loops\./u);
  assert.match(page, /Short glances\./u);
  assert.match(page, /<InteractiveClaudeTerminal/u);
  assert.match(page, /className="og-image-terminal" inert/u);
  assert.match(page, /phase="completed"/u);
  assert.match(page, /scenario="ready-long"/u);
  assert.match(page, /terminalId="tmux_04"/u);
  assert.match(css, /\.og-image-canvas\s*\{[^}]*width:\s*1200px/u);
  assert.match(css, /\.og-image-canvas\s*\{[^}]*height:\s*630px/u);
  assert.match(css, /animation:\s*none\s*!important/u);
  assert.match(css, /transition:\s*none\s*!important/u);
  assert.match(
    css,
    /body:has\(> \.og-image-canvas\) > \.minimal-header\s*\{[^}]*display:\s*none/u
  );
  assert.match(
    css,
    /\.og-image-terminal\s+\.mock-terminal\s*\{[^}]*width:\s*100%/u
  );
  assert.match(
    css,
    /\.og-image-terminal\s+\.mock-terminal\s*\{[^}]*height:\s*100%/u
  );
});

test("social metadata publishes the captured OG image with complete dimensions and alt text", async () => {
  const layout = await read("app/layout.tsx");

  assert.match(
    layout,
    /title:\s*"Coding Agent Status for Terminal & tmux \| Side Glance"/u
  );
  assert.match(
    layout,
    /description:\s*\n\s*"See when Claude Code, Codex, and other coding agents are working, waiting, ready, or failed\. Side Glance keeps status local in your terminal or tmux\."/u
  );
  assert.doesNotMatch(layout, /your terminal knows when it needs you/u);
  assert.match(layout, /images:\s*\[\s*\{/u);
  assert.match(layout, /url:\s*SITE_ASSETS\.openGraph/u);
  assert.match(layout, /width:\s*1200/u);
  assert.match(layout, /height:\s*630/u);
  assert.match(layout, /type:\s*"image\/png"/u);
  assert.match(layout, /alt:\s*"Side Glance — Long loops\. Short glances\."/u);
  assert.match(layout, /card:\s*"summary_large_image"/u);
});

test("the R2 manifest publishes the captured social asset as a 1200 by 630 PNG", async () => {
  const manifest = JSON.parse(
    await readFile("assets/r2-manifest.json", "utf8")
  ) as {
    assets: {
      openGraph: {
        contentType: string;
        height: number;
        key: string;
        sha256: string;
        width: number;
      };
    };
  };
  const image = manifest.assets.openGraph;

  assert.equal(image.contentType, "image/png");
  assert.equal(image.width, 1200);
  assert.equal(image.height, 630);
  assert.equal(
    image.key.match(/\.([a-f\d]{12})\.png$/u)?.[1],
    image.sha256.slice(0, 12)
  );
});
