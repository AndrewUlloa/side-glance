#!/usr/bin/env node

import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";

const CANONICAL_REPOSITORY = "AndrewUlloa/terminal-signal";
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u;

const [, , repositoryPath] = process.argv;
if (!repositoryPath) fail("usage: validate-release.mjs <repository-path>");

const rootManifest = await json(path.join(repositoryPath, "package.json"));
const cliManifest = await json(path.join(repositoryPath, "packages/cli/package.json"));
if (rootManifest.private !== true) fail("repository root must remain private");
if (cliManifest.name !== "terminal-signal" || cliManifest.private === true) {
  fail("only the terminal-signal CLI workspace may be publishable");
}
if (typeof cliManifest.version !== "string" || !VERSION.test(cliManifest.version)) {
  fail("CLI package version must be canonical SemVer");
}

const expectedTag = `v${cliManifest.version}`;
if (process.env.GITHUB_REPOSITORY !== CANONICAL_REPOSITORY) {
  fail(`release must run in the canonical repository ${CANONICAL_REPOSITORY}`);
}
if (process.env.GITHUB_EVENT_REPOSITORY_VISIBILITY !== "public") {
  fail("repository must be public before a release can publish");
}
if (process.env.GITHUB_REF_TYPE !== "tag") fail("release ref must be a tag");
if (process.env.GITHUB_REF_NAME !== expectedTag) {
  fail(`release tag must exactly match package version: ${expectedTag}`);
}
if (process.env.GITHUB_REF_PROTECTED !== "true") {
  fail("release tag must be protected by a repository ruleset");
}

const npmTag = cliManifest.version.includes("-") ? "beta" : "latest";
if (cliManifest.publishConfig?.tag !== npmTag) {
  fail(`publishConfig.tag must be ${npmTag} for ${cliManifest.version}`);
}
const outputPath = process.env.GITHUB_OUTPUT;
if (!outputPath) fail("GITHUB_OUTPUT is required");
await appendFile(
  outputPath,
  `version=${cliManifest.version}\ntag=${expectedTag}\nnpm_tag=${npmTag}\n`,
  "utf8",
);

async function json(filename) {
  try {
    const value = JSON.parse(await readFile(filename, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${filename} must contain an object`);
    return value;
  } catch (error) {
    fail(`cannot read ${filename}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function fail(message) {
  throw new Error(message);
}
