import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("uses Linear's measured one-time hero motion with a static reduced-motion path", async () => {
  const [page, playground, css, orchestrator] = await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("app/components/SideGlancePlayground.tsx", "utf8"),
    readFile("app/globals.css", "utf8"),
    readFile("app/components/MotionOrchestrator.tsx", "utf8"),
  ]);

  assert.match(page, /<MotionOrchestrator\s*\/>/u);
  assert.match(page, /hero-enter-line-1/u);
  assert.match(page, /hero-enter-line-2/u);
  assert.match(orchestrator, /useLayoutEffect/u);
  assert.match(orchestrator, /window\.location\.hash\.length\s*>\s*1/u);
  assert.match(orchestrator, /prefers-reduced-motion:\s*reduce/u);
  assert.match(orchestrator, /addEventListener\("scroll"/u);
  assert.doesNotMatch(orchestrator, /IntersectionObserver/u);
  assert.doesNotMatch(page, /data-reveal/u);
  assert.match(css, /@keyframes\s+hero-enter/u);
  assert.match(css, /filter:\s*blur\(10px\)/u);
  assert.match(css, /transform:\s*translateY\(20%\)/u);
  assert.match(css, /prefers-reduced-motion:\s*reduce/u);
  assert.doesNotMatch(css, /@keyframes\s+(?:terminal-sheen|ambient-drift|ring-breathe|core-glow|rotate-slow)/u);
  assert.match(playground, /terminal-demo/u);
  assert.doesNotMatch(css, /transition:\s*all\b/u);
});
