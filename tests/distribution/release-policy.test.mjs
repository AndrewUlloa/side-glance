import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const validator = path.join(repository, "scripts/release/validate-release.mjs");
const channelValidator = path.join(repository, "scripts/release/validate-release-channel.mjs");

test("CI and release workflows pin actions and enforce the public protected-tag boundary", async () => {
  const ci = await readFile(path.join(repository, ".github/workflows/ci.yml"), "utf8");
  const branchPolicy = await readFile(
    path.join(repository, ".github/workflows/branch-policy.yml"),
    "utf8",
  );
  const release = await readFile(path.join(repository, ".github/workflows/release.yml"), "utf8");
  const workflows = `${ci}\n${branchPolicy}\n${release}`;

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
  assert.match(release, /group:\s+side-glance-release/u);
  assert.doesNotMatch(release, /group:\s+release-\$\{\{ github\.ref_name \}\}/u);
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
  assert.doesNotMatch(release, /actions\/attest-build-provenance/u);
  assert.equal(
    [
      ...release.matchAll(
        /uses:\s+actions\/attest@508db95dd578ae2727ebd6217d5ba78e4fbda05d # v4\.2\.1/gu,
      ),
    ].length,
    2,
  );
  assert.equal([...release.matchAll(/artifact-metadata:\s+write/gu)].length, 2);
  assert.match(release, /registry-url:\s+https:\/\/registry\.npmjs\.org/u);
  assert.doesNotMatch(release, /NODE_AUTH_TOKEN|NPM_TOKEN|--clobber/u);
  assert.match(release, /NPM_TAG:\s+\$\{\{ needs\.validate\.outputs\.npm_tag \}\}/u);
  assert.match(release, /PRERELEASE:\s+\$\{\{ needs\.validate\.outputs\.prerelease \}\}/u);
  assert.match(release, /npm view side-glance dist-tags --json/u);
  assert.doesNotMatch(release, /npm view "side-glance@\$NPM_TAG" version/u);
  assert.match(release, /validate-release-channel\.mjs "\$VERSION" "\$NPM_TAG" "\$CURRENT_VERSION"/u);
  const npmTarballPublishPaths = [...release.matchAll(
    /npm publish ([^\s]+\.tgz) --access public --tag "\$NPM_TAG"/gu,
  )].map((match) => match[1]);
  assert.deepEqual(npmTarballPublishPaths, ["./release/*.tgz", "./release/*.tgz"]);
  assert.doesNotMatch(release, /npm publish release\/\*\.tgz/u);
  assert.doesNotMatch(release, /npm publish .*\.tgz --access public --tag beta/u);
  assert.match(release, /gh release create .*--verify-tag.*--draft/u);
  assert.match(release, /gh release verify "\$TAG" --repo "\$GITHUB_REPOSITORY"/u);
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
    GITHUB_REF_NAME: "v0.1.0-beta.9",
    GITHUB_REF_PROTECTED: "true",
    GITHUB_OUTPUT: output,
  };

  await command(process.execPath, [validator, repository], base);
  const fields = await readFile(output, "utf8");
  assert.match(fields, /^version=0\.1\.0-beta\.9$/mu);
  assert.match(fields, /^npm_tag=beta$/mu);
  assert.match(fields, /^prerelease=true$/mu);

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

test("release validation routes stable versions to latest and a normal GitHub release", async (context) => {
  const temporary = await mkdtemp(path.join(tmpdir(), "side-glance-stable-release-policy-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  await mkdir(path.join(temporary, "packages/cli"), { recursive: true });
  await writeFile(path.join(temporary, "package.json"), JSON.stringify({ private: true }), "utf8");
  await writeFile(
    path.join(temporary, "packages/cli/package.json"),
    JSON.stringify({
      name: "side-glance",
      version: "1.0.0",
      publishConfig: { tag: "latest" },
    }),
    "utf8",
  );
  const output = path.join(temporary, "output");

  await command(process.execPath, [validator, temporary], {
    GITHUB_REPOSITORY: "AndrewUlloa/side-glance",
    GITHUB_EVENT_REPOSITORY_VISIBILITY: "public",
    GITHUB_REF_TYPE: "tag",
    GITHUB_REF_NAME: "v1.0.0",
    GITHUB_REF_PROTECTED: "true",
    GITHUB_OUTPUT: output,
  });

  const fields = await readFile(output, "utf8");
  assert.match(fields, /^version=1\.0\.0$/mu);
  assert.match(fields, /^npm_tag=latest$/mu);
  assert.match(fields, /^prerelease=false$/mu);
});

test("release channels allow retries and upgrades but reject backward dist-tag moves", async () => {
  await command(process.execPath, [channelValidator, "0.1.0-beta.9", "beta", "0.1.0-beta.8"]);
  await command(process.execPath, [channelValidator, "0.1.0-beta.9", "beta", "0.1.0-beta.9"]);
  await command(process.execPath, [channelValidator, "1.0.0", "latest", "0.1.0-beta.3"]);
  await command(process.execPath, [channelValidator, "1.0.0", "latest"]);

  await assert.rejects(
    () => command(process.execPath, [channelValidator, "0.1.0-beta.2", "beta", "0.1.0-beta.3"]),
    /refusing to move npm beta backward/iu,
  );
  await assert.rejects(
    () => command(process.execPath, [channelValidator, "1.0.0", "latest", "2.0.0"]),
    /refusing to move npm latest backward/iu,
  );
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
