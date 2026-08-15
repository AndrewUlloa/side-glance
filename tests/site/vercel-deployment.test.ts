import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const readJson = async (path: string) =>
  JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;

test("defines an explicit standard Next.js deployment contract for Vercel", async () => {
  const packageManifest = await readJson("package.json");
  const dependencies = packageManifest.dependencies as Record<string, string>;
  const scripts = packageManifest.scripts as Record<string, string>;
  const vercel = await readJson("vercel.json");
  const vercelIgnore = await readFile(".vercelignore", "utf8");
  const packageLock = await readFile("package-lock.json", "utf8");
  const layout = await readFile("app/layout.tsx", "utf8");
  const launch = await readFile("LAUNCH.md", "utf8");
  const readme = await readFile("README.md", "utf8");

  assert.equal(dependencies.next, "16.3.0");
  assert.equal(scripts.dev, "next dev");
  assert.equal(scripts.build, "next build");
  assert.equal(scripts.start, "next start");
  assert.equal(scripts["build:vercel"], undefined);
  assert.equal(vercel.framework, "nextjs");
  assert.equal(vercel.buildCommand, "npm run build");
  for (const dependency of [
    "@cloudflare/vite-plugin",
    "@cloudflare/workers-types",
    "@vitejs/plugin-react",
    "@vitejs/plugin-rsc",
    "drizzle-kit",
    "vinext",
    "vite",
    "wrangler",
  ]) {
    assert.equal(
      (packageManifest.devDependencies as Record<string, string>)[dependency],
      undefined
    );
  }
  for (const generatedDirectory of ["dist", "outputs", "work"]) {
    assert.match(vercelIgnore, new RegExp(`^${generatedDirectory}$`, "mu"));
  }
  for (const obsoletePath of [
    "vite.config.ts",
    "worker/index.ts",
    "worker-configuration.d.ts",
    "build/sites-vite-plugin.ts",
    ".openai/hosting.json",
    "db/index.ts",
    "db/schema.ts",
    "drizzle.config.ts",
    "drizzle/meta/_journal.json",
    "examples/d1/app/api/notes/route.ts",
    "examples/d1/db/schema.ts",
  ]) {
    await assert.rejects(access(obsoletePath));
  }
  assert.equal(dependencies["drizzle-orm"], undefined);
  assert.doesNotMatch(
    packageLock,
    /node_modules\/(?:@cloudflare|@vinext|drizzle-kit|drizzle-orm|vinext|wrangler)(?:\/|")/u
  );
  assert.match(layout, /VERCEL_PROJECT_PRODUCTION_URL/u);
  assert.doesNotMatch(layout, /terminal-signal\.pages\.dev/u);
  assert.match(layout, /https:\/\/side-glance\.vercel\.app/u);
  assert.doesNotMatch(readme, /https:\/\/terminal-signal\.vercel\.app/u);
  assert.match(launch, /https:\/\/side-glance\.vercel\.app/u);
  assert.match(launch, /dpl_877rCZQP8w1VVbcRTPNqVMjqT9xM/u);
  assert.match(launch, /dpl_12hgQd7peRczGnDuY4diahzdsbWE/u);
  assert.doesNotMatch(launch, /No Side Glance deployment has been created/u);
});
