import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("the landing surface fills wide displays and scales its primary UI up", async () => {
  const css = await read("app/globals.css");
  const homeRule = css.match(/\.minimal-home\s*\{([\s\S]*?)\}/u)?.[1] ?? "";
  const wideLayout =
    css.match(/@media \(min-width:\s*1600px\)\s*\{([\s\S]*?)\n\}/u)?.[1] ?? "";

  assert.doesNotMatch(homeRule, /max-width:\s*1512px/u);
  assert.match(homeRule, /background:\s*#fff/u);
  assert.match(wideLayout, /--spacing-site-gutter:\s*clamp\(/u);
  assert.match(
    wideLayout,
    /\.minimal-copy h1\s*\{[^}]*font-size:\s*clamp\(72px,\s*4vw,\s*104px\)/u
  );
  assert.match(
    wideLayout,
    /\.minimal-copy p\s*\{[^}]*font-size:\s*clamp\(24px,\s*1\.45vw,\s*34px\)/u
  );
  assert.match(
    wideLayout,
    /\.mock-terminal\s*\{[^}]*height:\s*min\(56dvh,\s*900px\)[^}]*aspect-ratio:\s*1472\s*\/\s*912/u
  );
  assert.match(
    wideLayout,
    /\.mock-terminal-bar\s*\{[^}]*font-size:\s*clamp\(/u
  );
  assert.match(
    wideLayout,
    /\.mock-claude-composer input\s*\{[^}]*font-size:\s*clamp\(/u
  );
});

test("the favicon is transparent with edge-to-edge horizontal tiles", async () => {
  const favicon = await read("public/favicon.svg");

  assert.doesNotMatch(favicon, /<style\b/u);
  assert.doesNotMatch(favicon, /class="background"/u);
  assert.doesNotMatch(
    favicon,
    /<rect[^>]*(?:width="64"[^>]*height="64"|height="64"[^>]*width="64")/u
  );
  assert.equal((favicon.match(/<rect\b/gu) ?? []).length, 4);
  assert.equal((favicon.match(/x="0"/gu) ?? []).length, 2);
  assert.equal((favicon.match(/x="34"/gu) ?? []).length, 2);
  assert.equal((favicon.match(/width="30"/gu) ?? []).length, 4);
  assert.match(favicon, /y="12\.75"/u);
});
