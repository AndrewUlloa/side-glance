import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = async (path: string) =>
  JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;

test("defines an explicit standard Next.js deployment contract for Vercel", async () => {
  const packageManifest = await readJson("package.json");
  const dependencies = packageManifest.dependencies as Record<string, string>;
  const scripts = packageManifest.scripts as Record<string, string>;
  const vercel = await readJson("vercel.json");
  const vercelIgnore = await readFile(".vercelignore", "utf8");
  const layout = await readFile("app/layout.tsx", "utf8");
  const launch = await readFile("LAUNCH.md", "utf8");
  const readme = await readFile("README.md", "utf8");

  assert.equal(dependencies.next, "16.3.0");
  assert.equal(scripts["build:vercel"], "next build");
  assert.equal(vercel.framework, "nextjs");
  assert.equal(vercel.buildCommand, "npm run build:vercel");
  for (const generatedDirectory of [".vinext", ".wrangler", "dist", "outputs", "work"]) {
    assert.match(vercelIgnore, new RegExp(`^${generatedDirectory}$`, "mu"));
  }
  assert.match(layout, /VERCEL_PROJECT_PRODUCTION_URL/u);
  assert.doesNotMatch(layout, /terminal-signal\.pages\.dev/u);
  assert.match(readme, /https:\/\/terminal-signal\.vercel\.app/u);
  assert.match(launch, /dpl_[A-Za-z0-9]+/u);
  assert.match(launch, /vercel rollback dpl_[A-Za-z0-9]+ --yes/u);
});
