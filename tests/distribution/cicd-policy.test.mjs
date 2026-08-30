import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../..", import.meta.url));

test("enforces the feature to staging to main delivery path", async () => {
  const [
    ci,
    branchPolicy,
    prePush,
    dependabot,
    cicd,
    packageManifest,
    mainRuleset,
  ] = await Promise.all([
    text(".github/workflows/ci.yml"),
    text(".github/workflows/branch-policy.yml"),
    text(".husky/pre-push"),
    text(".github/dependabot.yml"),
    text("docs/cicd.md"),
    readJson("package.json"),
    readJson(".github/rulesets/protect-main.json"),
  ]);

  assert.match(ci, /pull_request:\s*\n\s+branches:\s*\[main, staging\]/u);
  assert.match(ci, /push:\s*\n\s+branches:\s*\[main, staging\]/u);
  assert.match(ci, /merge_group:\s*\n\s+branches:\s*\[main, staging\]/u);
  assert.match(ci, /group:\s+ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}/u);
  assert.match(ci, /cancel-in-progress:\s+true/u);
  assert.match(ci, /name:\s+verify/u);

  assert.match(branchPolicy, /pull_request:\s*\n\s+branches:\s*\[main\]/u);
  assert.match(branchPolicy, /HEAD_REF:\s+\$\{\{ github\.head_ref \}\}/u);
  assert.match(branchPolicy, /HEAD_REF[^\n]*!=[^\n]*staging/u);
  assert.match(branchPolicy, /PRs to main must come from staging/u);

  assert.match(prePush, /protected="main staging"/u);
  assert.match(prePush, /Direct push to '\$p' is blocked/u);
  assert.match(prePush, /feature\/\* -> staging -> main/u);
  assert.equal(packageManifest.scripts.prepare, "husky");
  assert.equal(packageManifest.devDependencies.husky, "9.1.7");

  assert.equal([...dependabot.matchAll(/target-branch:\s+staging/gu)].length, 2);
  assert.deepEqual(dependabotGroupPatterns(dependabot, "next-toolchain"), [
    "next",
    "@next/eslint-plugin-next",
  ]);
  assert.deepEqual(dependabotGroupPatterns(dependabot, "site-styling"), [
    "tailwindcss",
    "@tailwindcss/postcss",
  ]);
  assert.deepEqual(dependabotGroupPatterns(dependabot, "biome-linting"), [
    "@biomejs/biome",
    "ultracite",
  ]);
  assert.deepEqual(
    dependabotGroupPatterns(dependabot, "typescript-toolchain"),
    ["typescript", "typescript-eslint", "@types/*"]
  );
  assert.match(
    dependabot,
    /^\s{6}- dependency-name: typescript\n(?:^\s{8,}.*\n?)*?^\s{8}versions:\s*\n\s{10}- "7\.x"$/mu
  );
  assert.doesNotMatch(dependabot, /^\s{6}development-dependencies:/mu);
  assert.match(cicd, /feature\/\*.*staging.*main/su);
  assert.match(cicd, /merge commit.*staging.*main/isu);
  assert.match(cicd, /Vercel Git integration/u);
  assert.match(cicd, /CI \/ verify/u);
  assert.match(cicd, /Branch Policy \/ require-staging-head/u);

  assert.equal(mainRuleset.name, "Protect main");
  assert.equal(mainRuleset.target, "branch");
  assert.equal(mainRuleset.enforcement, "active");
  assert.deepEqual(mainRuleset.conditions.ref_name.include, ["refs/heads/main"]);
  const requiredChecks = mainRuleset.rules.find(
    ({ type }) => type === "required_status_checks",
  );
  assert.ok(requiredChecks);
  assert.equal(requiredChecks.parameters.strict_required_status_checks_policy, true);
  assert.deepEqual(
    requiredChecks.parameters.required_status_checks.map(({ context }) => context),
    [
      "verify",
      "npm-compatibility (22.14.0)",
      "npm-compatibility (24.18.0)",
      "native-macos-arm64",
      "Vercel",
      "require-staging-head",
    ],
  );
});

test("does not accept a dependency from a later Dependabot group", async () => {
  const dependabot = await text(".github/dependabot.yml");
  const misgrouped = dependabot
    .replace('          - "@next/eslint-plugin-next"\n', "")
    .replace(
      "      site-styling:\n        patterns:\n",
      '      site-styling:\n        patterns:\n          - "@next/eslint-plugin-next"\n'
    );

  assert.deepEqual(dependabotGroupPatterns(misgrouped, "next-toolchain"), [
    "next",
  ]);
});

function dependabotGroupPatterns(source, groupName) {
  const marker = `      ${groupName}:\n`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing Dependabot group: ${groupName}`);
  const body = source.slice(start + marker.length);
  const boundary = body.search(/^ {0,6}\S/mu);
  const group = boundary === -1 ? body : body.slice(0, boundary);
  const patternsMarker = "        patterns:\n";
  const patternsStart = group.indexOf(patternsMarker);
  assert.notEqual(
    patternsStart,
    -1,
    `missing patterns for Dependabot group: ${groupName}`
  );
  const patternsBody = group.slice(patternsStart + patternsMarker.length);
  const patternsBoundary = patternsBody.search(/^ {0,8}\S/mu);
  const patternsBlock =
    patternsBoundary === -1
      ? patternsBody
      : patternsBody.slice(0, patternsBoundary);
  const patterns = patternsBlock.match(/^\s{10}- (.+)$/gmu) ?? [];
  return patterns.map((pattern) =>
    pattern.replace(/^\s{10}- /u, "").replace(/^"|"$/gu, "")
  );
}

async function text(filename) {
  return readFile(path.join(repository, filename), "utf8");
}

async function readJson(filename) {
  return JSON.parse(await text(filename));
}
