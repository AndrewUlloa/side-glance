import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8").catch(() => "");

test("the install control copies npm and morphs into confirmation", async () => {
  const [page, installButton, measureHook, css] = await Promise.all([
    read("app/page.tsx"),
    read("app/components/InstallButton.tsx"),
    read("app/hooks/useMeasure.ts"),
    read("app/globals.css"),
  ]);

  assert.match(page, /<InstallButton/u);
  assert.match(page, /public beta · v0\.1/u);
  assert.match(page, /install the public beta from npm/u);
  assert.doesNotMatch(installButton, /github\.com\/AndrewUlloa\/side-glance/u);

  assert.match(installButton, /^"use client";/u);
  assert.match(
    installButton,
    /const INSTALL_COMMAND = "npm install -g side-glance@beta";/u
  );
  assert.match(
    installButton,
    /navigator\.clipboard\.writeText\(INSTALL_COMMAND\)/u
  );
  assert.match(installButton, /AnimatePresence/u);
  assert.match(installButton, /mode="popLayout"/u);
  assert.match(installButton, /useReducedMotion/u);
  assert.match(installButton, /useMeasure/u);
  assert.match(installButton, /animate=\{\{ width: targetWidth \}\}/u);
  assert.doesNotMatch(installButton, /layout=\{/u);
  assert.match(installButton, /copied \? "Copied npm" : "Install"/u);
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
