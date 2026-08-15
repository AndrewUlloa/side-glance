import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [packageSource, layoutSource, stylesheet, smoothScrollSource] =
  await Promise.all([
    readFile("package.json", "utf8"),
    readFile("app/layout.tsx", "utf8"),
    readFile("app/globals.css", "utf8"),
    readFile("app/components/SmoothScroll.tsx", "utf8").catch(() => ""),
  ]);

test("mounts the supported Lenis React adapter once at the document root", () => {
  const packageJson = JSON.parse(packageSource) as {
    dependencies?: Record<string, string>;
  };

  assert.equal(packageJson.dependencies?.lenis, "1.3.26");
  assert.match(layoutSource, /import\s+"lenis\/dist\/lenis\.css"/u);
  assert.match(layoutSource, /<SmoothScroll\s*\/>/u);
  assert.match(smoothScrollSource, /["']use client["']/u);
  assert.match(
    smoothScrollSource,
    /import\s*\{\s*ReactLenis\s*\}\s*from\s*["']lenis\/react["']/u
  );
  assert.match(smoothScrollSource, /<ReactLenis\s+root/u);
});

test("uses Lenis for anchors and RAF while preserving accessible motion", () => {
  assert.match(smoothScrollSource, /autoRaf:\s*true/u);
  assert.match(smoothScrollSource, /anchors:\s*true/u);
  assert.match(smoothScrollSource, /stopInertiaOnNavigate:\s*true/u);
  assert.match(smoothScrollSource, /respectReducedMotion:\s*true/u);
  assert.doesNotMatch(smoothScrollSource, /syncTouch:\s*true/u);
  assert.doesNotMatch(stylesheet, /html\s*\{[^}]*scroll-behavior:\s*smooth/u);
  assert.match(stylesheet, /prefers-reduced-motion:\s*reduce/u);
});
