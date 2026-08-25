import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const generator = path.join(repository, "scripts/release/generate-homebrew-formula.mjs");

test("generates a validated Homebrew formula from immutable release metadata", async (context) => {
  const temporary = await mkdtemp(path.join(tmpdir(), "side-glance-homebrew-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const manifestPath = path.join(temporary, "release-manifest.json");
  const formulaPath = path.join(temporary, "side-glance.rb");
  const manifest = releaseManifest();
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  await command(process.execPath, [generator, manifestPath, formulaPath]);

  const formula = await readFile(formulaPath, "utf8");
  assert.match(formula, /class SideGlance < Formula/u);
  assert.doesNotMatch(formula, /^\s*version\s/mu);
  assert.match(formula, /license "Apache-2\.0"/u);
  for (const artifact of manifest.artifacts) {
    assert.ok(formula.includes(artifact.url));
    assert.ok(formula.includes(artifact.sha256));
  }
  assert.match(formula, /Intel macOS.*experimental/u);
  assert.match(formula, /bin\.install "side-glance"/u);
  assert.match(formula, /assert_equal version\.to_s/u);
  assert.match(formula, /preview --phase waiting --elapsed 60 --json/u);
  assert.match(formula, /assert_match '"phase":"waiting"'/u);
  await command("/usr/bin/ruby", ["-c", formulaPath]);
  await verifyWithHomebrewWhenAvailable(formulaPath);
});

test("refuses formula metadata that does not point at Side Glance's immutable release", async (context) => {
  const temporary = await mkdtemp(path.join(tmpdir(), "side-glance-homebrew-invalid-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const manifest = releaseManifest();
  manifest.artifacts[0].url = "https://example.com/owned.tar.gz";
  const manifestPath = path.join(temporary, "release-manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest), "utf8");

  await assert.rejects(
    () => command(process.execPath, [generator, manifestPath, path.join(temporary, "formula.rb")]),
    /immutable Side Glance release URL/iu,
  );
});

function releaseManifest() {
  const version = "0.1.0-beta.5";
  const tag = `v${version}`;
  const base = `https://github.com/AndrewUlloa/side-glance/releases/download/${tag}`;
  const artifact = (target, character, support = "supported") => {
    const filename = `side-glance-v${version}-${target}.tar.gz`;
    return {
      target,
      support,
      filename,
      url: `${base}/${filename}`,
      sha256: character.repeat(64),
      size: 100,
    };
  };
  return {
    schemaVersion: 1,
    version,
    tag,
    repository: "AndrewUlloa/side-glance",
    sourceCommit: "e".repeat(40),
    artifacts: [
      artifact("darwin-arm64", "a"),
      artifact("linux-x64-gnu", "b"),
      artifact("linux-arm64-gnu", "c"),
      artifact("darwin-x64.experimental", "d", "experimental"),
    ],
  };
}

async function verifyWithHomebrewWhenAvailable(formulaPath) {
  const environment = {
    ...process.env,
    HOMEBREW_CACHE: path.join(path.dirname(formulaPath), "homebrew-cache"),
    HOMEBREW_NO_ANALYTICS: "1",
    HOMEBREW_NO_AUTO_UPDATE: "1",
  };
  try {
    await command("brew", ["--version"], environment);
  } catch {
    return;
  }
  // A maintainer may already have AndrewUlloa/tap/side-glance installed. Homebrew
  // loads tapped formulae while styling a path, so linting a second SideGlance class
  // reports a false duplicate-method offense. Preserve the generated body while
  // giving only the temporary lint copy its own formula identity.
  const styleFormulaPath = path.join(path.dirname(formulaPath), "side-glance-generated-test.rb");
  const formula = await readFile(formulaPath, "utf8");
  await writeFile(
    styleFormulaPath,
    formula.replace("class SideGlance < Formula", "class SideGlanceGeneratedTest < Formula"),
    "utf8",
  );
  await command("brew", ["style", styleFormulaPath], environment);
}

function command(executable, args, environment = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`${executable} failed (${signal ?? code}):\n${stderr}${stdout}`));
    });
  });
}
