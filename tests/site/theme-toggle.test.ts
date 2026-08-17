import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("theme infrastructure remains available while the focused hero stays white", async () => {
  const [page, layout, toggle, css] = await Promise.all([
    read("app/page.tsx"),
    read("app/layout.tsx"),
    read("app/components/ThemeToggle.tsx").catch(() => ""),
    read("app/globals.css"),
  ]);

  assert.doesNotMatch(page, /import \{ ThemeToggle \}/u);
  assert.doesNotMatch(page, /<ThemeToggle\s*\/>/u);

  assert.match(layout, /suppressHydrationWarning/u);
  assert.match(layout, /import Script from "next\/script"/u);
  assert.match(layout, /strategy="beforeInteractive"/u);
  assert.match(layout, /localStorage\.getItem\("side-glance-theme"\)/u);
  assert.match(layout, /matchMedia\("\(prefers-color-scheme: light\)"\)/u);
  assert.ok(
    layout.indexOf("side-glance-theme") < layout.indexOf("<body"),
    "the theme bootstrap should run before body content is painted"
  );

  assert.match(toggle, /aria-label="Toggle color theme"/u);
  assert.match(toggle, /aria-pressed=\{theme === "light"\}/u);
  assert.match(toggle, /const THEME_STORAGE_KEY = "side-glance-theme"/u);
  assert.match(
    toggle,
    /localStorage\.setItem\(THEME_STORAGE_KEY, nextTheme\)/u
  );
  assert.match(toggle, /AnimatePresence initial=\{false\}/u);
  assert.match(toggle, /useReducedMotion/u);
  assert.match(toggle, /ICON_MOTION\.reducedTransition/u);
  assert.match(toggle, /ICON_MOTION\.transition/u);

  assert.match(css, /:root\[data-theme="light"\]\s*\{/u);
  assert.match(css, /\.minimal-home\s*\{[\s\S]*background:\s*#fff/u);
  assert.match(css, /\.nav-actions\s*\{[\s\S]*justify-self:\s*end/u);
  assert.match(
    css,
    /\.theme-toggle\s*\{[\s\S]*min-width:\s*40px[\s\S]*min-height:\s*40px/u
  );
});
