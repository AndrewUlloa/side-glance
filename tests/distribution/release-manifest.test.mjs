import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const generator = path.join(repository, "scripts/release/create-release-manifest.mjs");
const version = "0.1.0-beta.2";
const tag = `v${version}`;
const targets = [
  ["darwin-arm64", "supported"],
  ["linux-x64-gnu", "supported"],
  ["linux-arm64-gnu", "supported"],
  ["darwin-x64.experimental", "experimental"],
];

test("binds the exact release artifacts to versioned checksums and immutable URLs", async (context) => {
  const temporary = await fixture(context);
  const output = path.join(temporary, "release-manifest.json");
  await command(process.execPath, [generator, temporary, path.join(temporary, "package.json"), output], {
    SIDE_GLANCE_RELEASE_TAG: tag,
    GITHUB_SHA: "e".repeat(40),
  });

  const manifest = JSON.parse(await readFile(output, "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.repository, "AndrewUlloa/side-glance");
  assert.equal(manifest.version, version);
  assert.equal(manifest.tag, tag);
  assert.equal(manifest.sourceCommit, "e".repeat(40));
  assert.equal(
    manifest.npm.integrity,
    `sha512-${createHash("sha512")
      .update(await readFile(path.join(temporary, manifest.npm.filename)))
      .digest("base64")}`,
  );
  assert.deepEqual(
    manifest.artifacts.map(({ target, support }) => [target, support]),
    targets,
  );

  const allFiles = [...manifest.artifacts, manifest.npm];
  for (const entry of allFiles) {
    const bytes = await readFile(path.join(temporary, entry.filename));
    assert.equal(entry.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(entry.size, bytes.byteLength);
    assert.equal(
      entry.url,
      `https://github.com/AndrewUlloa/side-glance/releases/download/${tag}/${entry.filename}`,
    );
  }

  const sums = await readFile(path.join(temporary, "SHA256SUMS"), "utf8");
  assert.deepEqual(
    sums.trim().split("\n").map((line) => line.split("  ")[1]),
    allFiles.map(({ filename }) => filename).sort(),
  );
});

test("refuses a release with a missing supported platform artifact", async (context) => {
  const temporary = await fixture(context);
  await rm(path.join(temporary, `side-glance-v${version}-linux-arm64-gnu.tar.gz`));
  await assert.rejects(
    () => command(
      process.execPath,
      [generator, temporary, path.join(temporary, "package.json"), path.join(temporary, "manifest.json")],
      { SIDE_GLANCE_RELEASE_TAG: tag, GITHUB_SHA: "e".repeat(40) },
    ),
    /missing supported release artifact.*linux-arm64-gnu/iu,
  );
});

test("refuses symbolic-link release artifacts", async (context) => {
  const temporary = await fixture(context);
  const artifact = path.join(temporary, `side-glance-v${version}-linux-arm64-gnu.tar.gz`);
  const outside = path.join(path.dirname(temporary), `${path.basename(temporary)}-outside.tar.gz`);
  context.after(() => rm(outside, { force: true }));
  await writeFile(outside, "outside bytes");
  await rm(artifact);
  await symlink(outside, artifact);
  await assert.rejects(
    () => command(
      process.execPath,
      [generator, temporary, path.join(temporary, "package.json"), path.join(temporary, "manifest.json")],
      { SIDE_GLANCE_RELEASE_TAG: tag, GITHUB_SHA: "e".repeat(40) },
    ),
    /symbolic link/iu,
  );
});

test("refuses a tag that does not exactly match the package version", async (context) => {
  const temporary = await fixture(context);
  await assert.rejects(
    () => command(
      process.execPath,
      [generator, temporary, path.join(temporary, "package.json"), path.join(temporary, "manifest.json")],
      { SIDE_GLANCE_RELEASE_TAG: "v0.1.0", GITHUB_SHA: "e".repeat(40) },
    ),
    /release tag must be v0\.1\.0-beta\.2/iu,
  );
});

async function fixture(context) {
  const temporary = await mkdtemp(path.join(tmpdir(), "side-glance-release-manifest-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  await mkdir(temporary, { recursive: true });
  await writeFile(
    path.join(temporary, "package.json"),
    `${JSON.stringify({ name: "side-glance", version })}\n`,
  );
  for (const [target] of targets) {
    const filename = `side-glance-v${version}-${target}.tar.gz`;
    await writeFile(path.join(temporary, filename), `native artifact for ${target}\n`);
  }
  await writeFile(
    path.join(temporary, `side-glance-${version}.tgz`),
    "exact npm package bytes\n",
  );
  return temporary;
}

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
      reject(new Error(`${executable} failed (${signal ?? code}):\n${stderr || stdout}`));
    });
  });
}
