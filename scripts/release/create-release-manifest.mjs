#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const REPOSITORY = "AndrewUlloa/side-glance";
const TARGETS = [
  ["darwin-arm64", "supported"],
  ["linux-x64-gnu", "supported"],
  ["linux-arm64-gnu", "supported"],
  ["darwin-x64.experimental", "experimental"],
];
const COMMIT = /^[a-f0-9]{40}$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u;

const [, , artifactsDirectory, packagePath, outputPath] = process.argv;
if (!artifactsDirectory || !packagePath || !outputPath) {
  fail("usage: create-release-manifest.mjs <artifacts-dir> <package.json> <output.json>");
}

const packageManifest = await parseJson(packagePath, "package manifest");
if (
  packageManifest.name !== "side-glance"
  || typeof packageManifest.version !== "string"
  || !VERSION.test(packageManifest.version)
) {
  fail("package manifest must identify a versioned side-glance package");
}

const version = packageManifest.version;
const expectedTag = `v${version}`;
const tag = process.env.SIDE_GLANCE_RELEASE_TAG ?? "";
if (tag !== expectedTag) fail(`release tag must be ${expectedTag}`);

const sourceCommit = process.env.GITHUB_SHA || "";
if (!COMMIT.test(sourceCommit)) {
  fail("GITHUB_SHA must be a lowercase 40-character commit hash");
}

const baseUrl = `https://github.com/${REPOSITORY}/releases/download/${tag}`;
const artifacts = [];
for (const [target, support] of TARGETS) {
  const filename = `side-glance-v${version}-${target}.tar.gz`;
  artifacts.push({
    target,
    support,
    filename,
    url: `${baseUrl}/${filename}`,
    ...await describeFile(path.join(artifactsDirectory, filename), target === "darwin-x64.experimental"
      ? "missing experimental release artifact"
      : "missing supported release artifact"),
  });
}

const npmFilename = `side-glance-${version}.tgz`;
const npmPath = path.join(artifactsDirectory, npmFilename);
const npm = {
  filename: npmFilename,
  url: `${baseUrl}/${npmFilename}`,
  ...await describeFile(npmPath, "missing exact npm release package"),
  integrity: `sha512-${createHash("sha512").update(await readFile(npmPath)).digest("base64")}`,
};

const manifest = {
  schemaVersion: 1,
  repository: REPOSITORY,
  version,
  tag,
  sourceCommit,
  artifacts,
  npm,
};

const describedFiles = [...artifacts, npm].sort((left, right) => left.filename.localeCompare(right.filename));
const checksumText = `${describedFiles.map(({ sha256, filename }) => `${sha256}  ${filename}`).join("\n")}\n`;
await writeFile(path.join(artifactsDirectory, "SHA256SUMS"), checksumText, "utf8");
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

async function describeFile(filename, missingMessage) {
  let details;
  let bytes;
  try {
    details = await lstat(filename);
    if (details.isSymbolicLink()) fail(`${path.basename(filename)} must not be a symbolic link`);
    bytes = await readFile(filename);
  } catch (error) {
    fail(`${missingMessage}: ${path.basename(filename)} (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!details.isFile()) fail(`${missingMessage}: ${path.basename(filename)} is not a regular file`);
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.byteLength,
  };
}

async function parseJson(filename, label) {
  try {
    const value = JSON.parse(await readFile(filename, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be a JSON object`);
    return value;
  } catch (error) {
    fail(`cannot read ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function fail(message) {
  throw new Error(message);
}
