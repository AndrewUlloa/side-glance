import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8").catch(() => "");

test("the install control copies Homebrew plus guided setup and morphs into confirmation", async () => {
  const [siteHeader, installButton, measureHook, css] = await Promise.all([
    read("app/components/SiteHeader.tsx"),
    read("app/components/InstallButton.tsx"),
    read("app/hooks/useMeasure.ts"),
    read("app/globals.css"),
  ]);

  assert.match(siteHeader, /<InstallButton/u);
  assert.match(siteHeader, /stable · v0\.1/u);
  assert.match(siteHeader, /copy Homebrew and guided setup commands/u);
  assert.match(installButton, /^"use client";/u);
  assert.match(
    installButton,
    /const INSTALL_COMMAND =\s*"brew install AndrewUlloa\/tap\/side-glance\\nside-glance init";/u
  );
  assert.match(
    installButton,
    /navigator\.clipboard\.writeText\(INSTALL_COMMAND\)/u
  );
  assert.match(
    installButton,
    /const INSTALL_FALLBACK_URL =\s*"https:\/\/github\.com\/AndrewUlloa\/side-glance#install";/u
  );
  assert.match(
    installButton,
    /catch \{[\s\S]*window\.location\.assign\(INSTALL_FALLBACK_URL\);[\s\S]*return;/u
  );
  assert.match(installButton, /AnimatePresence/u);
  assert.match(installButton, /mode="popLayout"/u);
  assert.match(installButton, /useReducedMotion/u);
  assert.match(installButton, /useMeasure/u);
  assert.match(installButton, /animate=\{\{ width: targetWidth \}\}/u);
  assert.doesNotMatch(installButton, /layout=\{/u);
  assert.match(installButton, /copied \? "Copied setup" : "Install"/u);
  assert.match(installButton, /setTimeout\([^,]+, 1400\)/u);
  assert.match(installButton, /clearTimeout/u);
  assert.match(installButton, /copied \? <CheckIcon \/> :/u);
  assert.match(measureHook, /new ResizeObserver/u);
  assert.match(measureHook, /contentRect\.width/u);
  assert.match(measureHook, /\.disconnect\(\)/u);
  assert.match(css, /\.minimal-install\s*\{[\s\S]*?overflow:\s*hidden/u);
  assert.match(
    installButton,
    /className="minimal-install-inner px-header-action-x py-header-action-y"/u
  );
  assert.doesNotMatch(
    css.match(/\.minimal-install-measure\s*\{([\s\S]*?)\}/u)?.[1] ?? "",
    /padding/u
  );
});
