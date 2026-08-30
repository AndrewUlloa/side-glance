import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("reveals the launch page only after the loader completes", async () => {
  const [page, siteHeader, css, loader, orchestrator] = await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("app/components/SiteHeader.tsx", "utf8"),
    readFile("app/globals.css", "utf8"),
    readFile("app/components/LoadingSequence.tsx", "utf8"),
    readFile("app/components/MotionOrchestrator.tsx", "utf8"),
  ]);

  assert.match(page, /<MotionOrchestrator\s*\/>/u);
  assert.match(
    siteHeader,
    /minimal-header-actions minimal-page-enter minimal-page-enter-actions gap-header-actions-gap/u
  );
  assert.match(page, /minimal-page-enter-line-1/u);
  assert.match(page, /minimal-page-enter-line-2/u);
  assert.match(page, /minimal-page-enter-description/u);
  assert.match(page, /minimal-page-enter-terminal/u);
  assert.match(orchestrator, /data(?:set\.)?pageMotion/u);
  assert.match(orchestrator, /side-glance:loading-complete/u);
  assert.match(orchestrator, /prefers-reduced-motion:\s*reduce/u);
  assert.match(orchestrator, /window\.location\.hash\.length\s*>\s*1/u);
  assert.match(loader, /side-glance:loading-complete/u);
  assert.match(loader, /dispatchEvent/u);
  assert.match(
    css,
    /\[data-page-motion="pending"\][\s\S]*?\.minimal-page-enter/u
  );
  assert.match(
    css,
    /\[data-page-motion="ready"\][\s\S]*?\.minimal-page-enter/u
  );
  assert.match(css, /@keyframes\s+minimal-page-enter/u);
  assert.match(css, /filter:\s*blur\(10px\)/u);
  assert.match(css, /transform:\s*translateY\(20%\)/u);
  assert.match(
    css,
    /minimal-page-enter-actions\s*\{[^}]*animation-delay:\s*0s/u
  );
  assert.match(
    css,
    /minimal-page-enter-line-1\s*\{[^}]*animation-delay:\s*0\.1s/u
  );
  assert.match(
    css,
    /minimal-page-enter-description\s*\{[^}]*animation-delay:\s*0\.3s/u
  );
  assert.doesNotMatch(page, /data-reveal/u);
  assert.match(
    css,
    /\.minimal-install\s*\{[\s\S]*transition:\s*background-color 160ms ease/u
  );
  assert.match(
    css,
    /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.minimal-page-enter\s*\{[^}]*animation:\s*none/u
  );
});
