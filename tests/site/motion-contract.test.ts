import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("uses restrained Linear-inspired motion with an accessible static path", async () => {
  const [page, playground, css, orchestrator] = await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("app/components/SignalPlayground.tsx", "utf8"),
    readFile("app/globals.css", "utf8"),
    readFile("app/components/MotionOrchestrator.tsx", "utf8").catch(() => ""),
  ]);

  assert.match(page, /<MotionOrchestrator\s*\/>/u);
  assert.match(page, /className="[^"]*hero-enter/u);
  assert.match(page, /data-reveal/u);
  assert.match(orchestrator, /IntersectionObserver/u);
  assert.match(orchestrator, /prefers-reduced-motion:\s*reduce/u);
  assert.match(css, /@keyframes\s+hero-enter/u);
  assert.match(css, /\[data-motion="ready"\]\s+\[data-reveal\]/u);
  assert.match(css, /@keyframes\s+terminal-sheen/u);
  assert.match(css, /prefers-reduced-motion:\s*reduce/u);
  assert.match(playground, /terminal-demo/u);
  assert.doesNotMatch(css, /transition:\s*all\b/u);
});
