import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("the shared header hides on downward scroll and returns after a small upward move", async () => {
  const [siteHeader, css] = await Promise.all([
    read("app/components/SiteHeader.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(siteHeader, /^"use client";/u);
  assert.match(siteHeader, /const REVEAL_SCROLL_DELTA = 4/u);
  assert.match(siteHeader, /const HIDE_SCROLL_DELTA = 8/u);
  assert.match(siteHeader, /window\.addEventListener\("scroll", handleScroll/u);
  assert.match(siteHeader, /requestAnimationFrame/u);
  assert.match(
    siteHeader,
    /data-scroll-state=\{isHidden \? "hidden" : "visible"\}/u
  );
  assert.match(siteHeader, /onFocusCapture=\{showHeader\}/u);

  assert.match(
    css,
    /\.minimal-header\[data-scroll-state="hidden"\]\s*\{[^}]*transform:\s*translateY\(-100%\)/u
  );
  assert.match(
    css,
    /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.minimal-header\s*\{[^}]*transition:\s*none/u
  );
});
