#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const REPOSITORY = "AndrewUlloa/side-glance";
const SUPPORTED_TARGETS = ["darwin-arm64", "linux-x64-gnu", "linux-arm64-gnu"];
const EXPERIMENTAL_TARGETS = ["darwin-x64.experimental"];
const REQUIRED_TARGETS = [...SUPPORTED_TARGETS, ...EXPERIMENTAL_TARGETS];
const ALLOWED_TARGETS = new Set(REQUIRED_TARGETS);
const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u;

const [, , manifestPath, outputPath] = process.argv;

if (!manifestPath || !outputPath) {
  fail("usage: generate-homebrew-formula.mjs <release-manifest.json> <formula.rb>");
}

const manifest = await loadManifest(manifestPath);
const artifacts = validateManifest(manifest);
const formula = renderFormula(artifacts);

await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await writeFile(outputPath, formula, "utf8");

async function loadManifest(filename) {
  let value;
  try {
    value = JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    fail(`cannot read release manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("release manifest must be a JSON object");
  }
  return value;
}

function validateManifest(value) {
  if (value.schemaVersion !== 1) fail("release manifest schemaVersion must be 1");
  if (typeof value.version !== "string" || !VERSION.test(value.version)) {
    fail("release manifest version is invalid");
  }
  if (value.tag !== `v${value.version}`) {
    fail("release manifest tag must exactly match its version");
  }
  if (value.repository !== REPOSITORY) {
    fail(`release manifest repository must be ${REPOSITORY}`);
  }
  if (typeof value.sourceCommit !== "string" || !COMMIT.test(value.sourceCommit)) {
    fail("release manifest sourceCommit must be a lowercase 40-character commit hash");
  }
  if (!Array.isArray(value.artifacts)) {
    fail("release manifest artifacts must be an array");
  }

  const byTarget = new Map();
  for (const artifact of value.artifacts) {
    if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
      fail("every release artifact must be an object");
    }
    if (typeof artifact.target !== "string" || !ALLOWED_TARGETS.has(artifact.target)) {
      fail(`unsupported release target: ${String(artifact.target)}`);
    }
    if (byTarget.has(artifact.target)) {
      fail(`duplicate release target: ${artifact.target}`);
    }

    const expectedSupport = SUPPORTED_TARGETS.includes(artifact.target)
      ? "supported"
      : "experimental";
    if (artifact.support !== expectedSupport) {
      fail(`${artifact.target} must be marked ${expectedSupport}`);
    }

    const expectedFilename = `side-glance-v${value.version}-${artifact.target}.tar.gz`;
    if (artifact.filename !== expectedFilename) {
      fail(`${artifact.target} has an invalid artifact filename`);
    }
    const expectedUrl = `https://github.com/${REPOSITORY}/releases/download/${value.tag}/${expectedFilename}`;
    if (artifact.url !== expectedUrl) {
      fail(`${artifact.target} must use its immutable Side Glance release URL`);
    }
    if (typeof artifact.sha256 !== "string" || !SHA256.test(artifact.sha256)) {
      fail(`${artifact.target} must have a lowercase SHA-256 digest`);
    }
    if (!Number.isSafeInteger(artifact.size) || artifact.size <= 0) {
      fail(`${artifact.target} must have a positive integer size`);
    }
    byTarget.set(artifact.target, artifact);
  }

  for (const target of REQUIRED_TARGETS) {
    if (!byTarget.has(target)) fail(`release manifest is missing ${target}`);
  }
  return byTarget;
}

function renderFormula(artifacts) {
  const darwinArm = artifacts.get("darwin-arm64");
  const linuxIntel = artifacts.get("linux-x64-gnu");
  const linuxArm = artifacts.get("linux-arm64-gnu");
  const darwinIntel = artifacts.get("darwin-x64.experimental");
  return `# typed: strict
# frozen_string_literal: true

# Side Glance installs the Side Glance coding-agent attention CLI.
class SideGlance < Formula
  desc "Local-first attention cues for coding-agent terminal sessions"
  homepage "https://github.com/${REPOSITORY}"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "${darwinArm.url}"
      sha256 "${darwinArm.sha256}"
    end

    on_intel do
      # Node SEA does not regularly test Intel macOS; this artifact is experimental.
      url "${darwinIntel.url}"
      sha256 "${darwinIntel.sha256}"
    end
  end

  on_linux do
    on_arm do
      url "${linuxArm.url}"
      sha256 "${linuxArm.sha256}"
    end

    on_intel do
      url "${linuxIntel.url}"
      sha256 "${linuxIntel.sha256}"
    end
  end

  def install
    bin.install "side-glance"
  end

  test do
    assert_equal version.to_s, shell_output("#{bin}/side-glance --version").strip
    output = shell_output("#{bin}/side-glance preview --phase waiting --elapsed 60 --json")
    assert_match '"phase":"waiting"', output
  end
end
`;
}

function fail(message) {
  throw new Error(message);
}
