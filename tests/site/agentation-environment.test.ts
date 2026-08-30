import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

interface EnvironmentModule {
  shouldShowAgentation: (input: {
    nodeEnv?: string;
    vercelEnv?: string;
  }) => boolean;
}

const environmentModuleUrl = new URL(
  "../../app/lib/agentation-environment.ts",
  import.meta.url
).href;
const environmentModule = (await import(environmentModuleUrl).catch(
  () => null
)) as EnvironmentModule | null;

const [packageSource, layoutSource, toolbarSource] = await Promise.all([
  readFile("package.json", "utf8"),
  readFile("app/layout.tsx", "utf8"),
  readFile("app/components/AgentationToolbar.tsx", "utf8").catch(() => ""),
]);

test("shows Agentation only in development and Vercel preview environments", () => {
  assert.ok(
    environmentModule,
    "the Agentation environment predicate must exist"
  );

  const matrix = [
    [{ nodeEnv: "development" }, true],
    [{ nodeEnv: "development", vercelEnv: "production" }, false],
    [{ nodeEnv: "production", vercelEnv: "development" }, true],
    [{ nodeEnv: "production", vercelEnv: "preview" }, true],
    [{ nodeEnv: "production" }, false],
    [{ nodeEnv: "production", vercelEnv: "production" }, false],
    [{ nodeEnv: "test", vercelEnv: "preview" }, true],
    [{ nodeEnv: "test" }, false],
    [{ nodeEnv: "test", vercelEnv: "staging" }, false],
    [{}, false],
  ] as const;

  for (const [input, expected] of matrix) {
    assert.equal(environmentModule.shouldShowAgentation(input), expected);
  }
});

test("mounts the client-only Agentation toolbar without remote sync", () => {
  const packageJson = JSON.parse(packageSource) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  assert.equal(packageJson.devDependencies?.agentation, "3.0.2");
  assert.equal(packageJson.dependencies?.agentation, undefined);
  assert.match(layoutSource, /shouldShowAgentation/u);
  assert.match(
    layoutSource,
    /<AgentationToolbar\s+enabled=\{showAgentation\}\s*\/>/u
  );
  assert.match(toolbarSource, /["']use client["']/u);
  assert.match(toolbarSource, /if\s*\(!enabled\)\s*return/u);
  assert.match(toolbarSource, /import\(["']agentation["']\)/u);
  assert.doesNotMatch(toolbarSource, /^import\s.+from\s+["']agentation["']/mu);
  assert.match(toolbarSource, /<Agentation\s*\/>/u);
  assert.doesNotMatch(toolbarSource, /endpoint\s*=/u);
});
