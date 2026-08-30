import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const siteIncludes = [
  "app/**/*.ts",
  "app/**/*.tsx",
  "app/**/*.css",
  "tests/site/**/*.ts",
  "tests/rendered-html.test.mjs",
  "next.config.ts",
  "postcss.config.mjs",
];

test("scopes Ultracite to the landing page and keeps it out of the published CLI", async () => {
  const [rootPackage, cliPackage, biome, eslint, lintStaged, preCommit] =
    await Promise.all([
      readJson("package.json"),
      readJson("packages/cli/package.json"),
      readJson("biome.json"),
      readFile("eslint.config.mjs", "utf8"),
      readFile("lint-staged.config.mjs", "utf8"),
      readFile(".husky/pre-commit", "utf8"),
    ]);

  assert.equal(rootPackage.devDependencies["@biomejs/biome"], "2.3.11");
  assert.equal(rootPackage.devDependencies.ultracite, "7.0.12");
  assert.equal(rootPackage.devDependencies["lint-staged"], "17.3.0");
  assert.equal(rootPackage.scripts["lint:site"], "biome check .");
  assert.equal(rootPackage.scripts["lint:site:fix"], "biome check --write .");
  assert.match(rootPackage.scripts.lint, /npm run lint:site/u);
  assert.match(rootPackage.scripts.lint, /npm run lint:repo/u);

  assert.deepEqual(biome.extends, [
    "ultracite/biome/core",
    "ultracite/biome/react",
    "ultracite/biome/next",
  ]);
  assert.deepEqual(biome.files.includes, siteIncludes);
  assert.deepEqual(biome.linter.includes, siteIncludes);
  assert.deepEqual(biome.formatter.includes, siteIncludes);
  assert.deepEqual(biome.assist.includes, siteIncludes);
  const testOverride = biome.overrides.find(
    (override: { includes: string[] }) =>
      override.includes.includes("tests/site/**/*.ts")
  );
  assert.deepEqual(testOverride?.includes, [
    "tests/site/**/*.ts",
    "tests/rendered-html.test.mjs",
  ]);
  assert.equal(testOverride?.linter.rules.performance.useTopLevelRegex, "off");

  const pageOverride = biome.overrides.find(
    (override: { includes: string[] }) =>
      override.includes.includes("app/page.tsx")
  );
  assert.equal(pageOverride?.linter.rules.a11y.useFocusableInteractive, "off");
  assert.equal(pageOverride?.linter.rules.a11y.useSemanticElements, "off");

  const playgroundOverride = biome.overrides.find(
    (override: { includes: string[] }) =>
      override.includes.includes("app/components/SideGlancePlayground.tsx")
  );
  assert.equal(
    playgroundOverride?.linter.rules.a11y.useSemanticElements,
    "off"
  );

  const storyboardOverride = biome.overrides.find(
    (override: { includes: string[] }) =>
      override.includes.includes("app/components/TerminalStoryboard.tsx")
  );
  assert.equal(
    storyboardOverride?.linter.rules.a11y.useSemanticElements,
    "off"
  );
  assert.deepEqual(
    storyboardOverride?.linter.rules.complexity.noExcessiveCognitiveComplexity,
    {
      level: "error",
      options: { maxAllowedComplexity: 25 },
    }
  );

  const modelOverride = biome.overrides.find(
    (override: { includes: string[] }) =>
      override.includes.includes("app/components/playground-model.ts")
  );
  assert.equal(modelOverride?.linter.rules.style.useDefaultSwitchClause, "off");
  for (const publishedPath of ["src/**", "packages/**", "scripts/**"]) {
    assert.ok(
      !biome.files.includes.some((include: string) =>
        include.startsWith(publishedPath)
      )
    );
  }

  assert.match(eslint, /app\/\*\*/u);
  assert.match(eslint, /tests\/site\/\*\*/u);
  assert.match(lintStaged, /app\/\*\*/u);
  assert.doesNotMatch(lintStaged, /src\/\*\*|packages\/\*\*/u);
  assert.match(preCommit, /npm exec lint-staged/u);

  assert.equal(cliPackage.dependencies, undefined);
  assert.equal(cliPackage.devDependencies, undefined);
  assert.deepEqual(cliPackage.files, [
    "dist/side-glance.mjs",
    "README.md",
    "LICENSE",
  ]);
});

async function readJson(path: string) {
  return JSON.parse(await readFile(path, "utf8"));
}
