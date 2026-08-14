import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const validator = path.join(repository, "scripts/release/validate-release.mjs");

test("CI and release workflows pin actions and enforce the public protected-tag boundary", async () => {
  const ci = await readFile(path.join(repository, ".github/workflows/ci.yml"), "utf8");
  const release = await readFile(path.join(repository, ".github/workflows/release.yml"), "utf8");
  const workflows = `${ci}\n${release}`;

  assert.doesNotMatch(workflows, /uses:\s+[^\s@]+@v\d/iu);
  for (const match of workflows.matchAll(/uses:\s+[^\s@]+@([^\s#]+)/gu)) {
    assert.match(match[1], /^[a-f0-9]{40}$/u);
  }
  assert.match(ci, /node-version:\s+\$\{\{ matrix\.node \}\}/u);
  assert.match(ci, /22\.14\.0/u);
  assert.match(ci, /24\.18\.0/u);
  assert.match(ci, /ubuntu-24\.04/u);
  assert.doesNotMatch(ci, /-latest/u);

  assert.match(release, /^permissions:\s*\{\}/mu);
  assert.match(release, /group:\s+release-\$\{\{ github\.ref_name \}\}/u);
  assert.match(release, /cancel-in-progress:\s+false/u);
  assert.match(release, /tags:\s*\["v\*"\]/u);
  assert.match(release, /node-version:\s+24\.18\.0/u);
  assert.match(release, /SIDE_GLANCE_RELEASE_NODE_VERSION:\s+24\.18\.0/u);
  for (const runner of ["ubuntu-24.04", "ubuntu-24.04-arm", "macos-15", "macos-15-intel"]) {
    assert.ok(release.includes(runner), `missing fixed release runner ${runner}`);
  }
  for (const target of [
    "darwin-arm64",
    "darwin-x64.experimental",
    "linux-x64-gnu",
    "linux-arm64-gnu",
  ]) {
    assert.ok(release.includes(target), `missing release target ${target}`);
  }
  assert.match(release, /environment:\s+npm-release/u);
  assert.match(release, /environment:\s+github-release/u);
  assert.match(release, /id-token:\s+write/u);
  assert.match(release, /attestations:\s+write/u);
  assert.doesNotMatch(release, /NODE_AUTH_TOKEN|NPM_TOKEN|--clobber/u);
  assert.match(release, /npm publish .*\.tgz --access public --tag beta/u);
  assert.match(release, /gh release create .*--verify-tag.*--draft/u);
  assert.match(release, /github\.event\.repository\.visibility/u);
  assert.match(release, /github\.ref_protected/u);
});

test("release validation accepts only Side Glance's public protected matching version tag", async (context) => {
  const temporary = await mkdtemp(path.join(tmpdir(), "side-glance-release-policy-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const output = path.join(temporary, "output");
  const base = {
    GITHUB_REPOSITORY: "AndrewUlloa/side-glance",
    GITHUB_EVENT_REPOSITORY_VISIBILITY: "public",
    GITHUB_REF_TYPE: "tag",
    GITHUB_REF_NAME: "v0.1.0-beta.1",
    GITHUB_REF_PROTECTED: "true",
    GITHUB_OUTPUT: output,
  };

  await command(process.execPath, [validator, repository], base);
  const fields = await readFile(output, "utf8");
  assert.match(fields, /^version=0\.1\.0-beta\.1$/mu);
  assert.match(fields, /^npm_tag=beta$/mu);

  for (const [field, value, pattern] of [
    ["GITHUB_EVENT_REPOSITORY_VISIBILITY", "private", /repository must be public/iu],
    ["GITHUB_REF_PROTECTED", "false", /tag must be protected/iu],
    ["GITHUB_REF_NAME", "v0.1.0", /must exactly match package version/iu],
    ["GITHUB_REPOSITORY", "attacker/fork", /canonical repository/iu],
  ]) {
    await assert.rejects(
      () => command(process.execPath, [validator, repository], { ...base, [field]: value }),
      pattern,
    );
  }
});

function command(executable, args, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`${executable} failed (${signal ?? code}):\n${stderr}${stdout}`));
    });
  });
}
