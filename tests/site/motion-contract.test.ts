import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("focused launch page stays static with a reduced-motion-safe interaction", async () => {
  const [page, css] = await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("app/globals.css", "utf8"),
  ]);

  assert.doesNotMatch(page, /MotionOrchestrator/u);
  assert.doesNotMatch(page, /hero-enter/u);
  assert.doesNotMatch(page, /data-reveal/u);
  assert.match(
    css,
    /\.minimal-install\s*\{[\s\S]*transition:\s*background-color 160ms ease/u
  );
  assert.match(
    css,
    /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.minimal-install\s*\{[^}]*transition:\s*none/u
  );
  assert.doesNotMatch(css, /\.minimal-[^{]+\{[^}]*animation:/u);
});
