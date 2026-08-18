#!/usr/bin/env node

const [, , proposedVersion, channel, currentVersion = ""] = process.argv;
if (!proposedVersion || !channel) {
  fail("usage: validate-release-channel.mjs <proposed-version> <channel> [current-version]");
}
if (channel !== "beta" && channel !== "latest") fail(`unsupported npm channel: ${channel}`);

const proposed = parse(proposedVersion);
const expectedChannel = proposed.prerelease.length > 0 ? "beta" : "latest";
if (channel !== expectedChannel) {
  fail(`${proposedVersion} must publish to npm ${expectedChannel}, not ${channel}`);
}

if (currentVersion) {
  const current = parse(currentVersion);
  if (compare(proposed, current) < 0) {
    fail(`refusing to move npm ${channel} backward from ${currentVersion} to ${proposedVersion}`);
  }
}

function parse(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/u.exec(
    version,
  );
  if (!match) fail(`invalid canonical SemVer: ${version}`);
  return {
    core: [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])],
    prerelease: match[4]?.split(".") ?? [],
  };
}

function compare(left, right) {
  for (let index = 0; index < left.core.length; index += 1) {
    if (left.core[index] < right.core[index]) return -1;
    if (left.core[index] > right.core[index]) return 1;
  }
  if (left.prerelease.length === 0) return right.prerelease.length === 0 ? 0 : 1;
  if (right.prerelease.length === 0) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;
    const leftNumeric = /^\d+$/u.test(leftIdentifier);
    const rightNumeric = /^\d+$/u.test(rightIdentifier);
    if (leftNumeric && rightNumeric) {
      return BigInt(leftIdentifier) < BigInt(rightIdentifier) ? -1 : 1;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }
  return 0;
}

function fail(message) {
  throw new Error(message);
}
