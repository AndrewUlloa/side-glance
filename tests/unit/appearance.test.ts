import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_SIDE_GLANCE_CONFIG,
  FileSideGlanceConfig,
  parseSideGlanceConfig,
  resolveAppearance,
} from "../../src/core/appearance.ts";

test("resolves Status, Heat, and Custom without mixing semantic failure", () => {
  const status = resolveAppearance({ preset: "status" }, 360);
  const heat = resolveAppearance(
    { preset: "heat", ceiling: { mode: "adaptive" } },
    360,
  );
  const custom = resolveAppearance(
    {
      preset: "custom",
      colors: {
        inactive: { wash: "111111", accent: "aaaaaa" },
        working: { wash: "122222", accent: "00aaaa" },
        waiting: { wash: "332200", accent: "ffaa00" },
        ready: { wash: "113311", accent: "44cc44" },
        failed: { wash: "331111", accent: "ff4444" },
      },
    },
    360,
  );

  assert.equal(status.completionCeilingSeconds, 360);
  assert.deepEqual(status.theme.washStops, ["173326", "173326"]);
  assert.equal(status.theme.failedAccent, "f33533");
  assert.equal(heat.completionCeilingSeconds, 360);
  assert.equal(heat.theme.tmuxStops.at(-1), "f33533");
  assert.deepEqual(custom.theme.washStops, ["113311", "113311"]);
  assert.equal(custom.theme.failedAccent, "ff4444");
});

test("rejects unknown appearance fields and malformed custom colors", () => {
  assert.throws(
    () => parseSideGlanceConfig({ schemaVersion: 1, appearance: { preset: "status", extra: true } }),
    /unknown field/i,
  );
  assert.throws(
    () =>
      parseSideGlanceConfig({
        schemaVersion: 1,
        appearance: {
          preset: "custom",
          colors: {
            inactive: { wash: "111111", accent: "aaaaaa" },
            working: { wash: "122222", accent: "00aaaa" },
            waiting: { wash: "332200", accent: "ffaa00" },
            ready: { wash: "escape\u001b", accent: "44cc44" },
            failed: { wash: "331111", accent: "ff4444" },
          },
        },
      }),
    /hexadecimal/i,
  );
});

test("writes private config atomically and safely falls back on invalid input", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "side-glance-config-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const store = new FileSideGlanceConfig({
    directory,
    rootDirectory: path.dirname(directory),
  });

  await store.write({
    schemaVersion: 1,
    appearance: { preset: "heat", ceiling: { mode: "fixed", seconds: 600 } },
  });
  const configPath = path.join(directory, "config.json");
  assert.equal((await lstat(directory)).mode & 0o777, 0o700);
  assert.equal((await lstat(configPath)).mode & 0o777, 0o600);
  assert.equal((await store.inspect()).valid, true);

  await writeFile(configPath, '{"schemaVersion":1,"appearance":{"preset":"bogus"}}');
  const invalid = await store.inspect();
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.config, DEFAULT_SIDE_GLANCE_CONFIG);
  assert.match(invalid.error ?? "", /preset/i);
  assert.match(await readFile(configPath, "utf8"), /bogus/);
});

test("never follows a linked appearance file", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "side-glance-config-link-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const outside = path.join(directory, "outside.json");
  const configDirectory = path.join(directory, "config");
  await writeFile(outside, JSON.stringify(DEFAULT_SIDE_GLANCE_CONFIG));
  await new FileSideGlanceConfig({
    directory: configDirectory,
    rootDirectory: directory,
  }).write(DEFAULT_SIDE_GLANCE_CONFIG);
  await rm(path.join(configDirectory, "config.json"));
  await symlink(outside, path.join(configDirectory, "config.json"));

  const inspection = await new FileSideGlanceConfig({
    directory: configDirectory,
    rootDirectory: directory,
  }).inspect();
  assert.equal(inspection.valid, false);
  assert.deepEqual(inspection.config, DEFAULT_SIDE_GLANCE_CONFIG);
});

test("never follows a linked appearance parent directory", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "side-glance-config-parent-link-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const outside = path.join(root, "outside");
  const linked = path.join(root, "linked");
  await mkdir(outside, { recursive: true });
  const outsideStore = new FileSideGlanceConfig({
    directory: outside,
    rootDirectory: root,
  });
  await outsideStore.write({
    schemaVersion: 1,
    appearance: { preset: "heat", ceiling: { mode: "fixed", seconds: 600 } },
  });
  const original = await readFile(outsideStore.configPath, "utf8");
  await symlink(outside, linked, "dir");

  const linkedStore = new FileSideGlanceConfig({
    directory: linked,
    rootDirectory: root,
  });
  const inspection = await linkedStore.inspect();
  assert.equal(inspection.valid, false);
  assert.deepEqual(inspection.config, DEFAULT_SIDE_GLANCE_CONFIG);
  await assert.rejects(() => linkedStore.write(DEFAULT_SIDE_GLANCE_CONFIG), /link|directory/iu);
  assert.equal(await readFile(outsideStore.configPath, "utf8"), original);
});

test("never enters through an intermediate linked appearance parent", async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), "side-glance-config-intermediate-link-"),
  );
  context.after(() => rm(root, { recursive: true, force: true }));
  const outside = path.join(root, "outside");
  const outsideDirectory = path.join(outside, "side-glance");
  const alias = path.join(root, "alias");
  await mkdir(outsideDirectory, { recursive: true });
  const outsideStore = new FileSideGlanceConfig({
    directory: outsideDirectory,
    rootDirectory: root,
  });
  await outsideStore.write({
    schemaVersion: 1,
    appearance: { preset: "heat", ceiling: { mode: "fixed", seconds: 600 } },
  });
  const original = await readFile(outsideStore.configPath, "utf8");
  await symlink(outside, alias, "dir");

  const linkedStore = new FileSideGlanceConfig({
    directory: path.join(alias, "side-glance"),
    rootDirectory: root,
  });
  const inspection = await linkedStore.inspect();

  assert.equal(inspection.valid, false);
  await assert.rejects(() => linkedStore.write(DEFAULT_SIDE_GLANCE_CONFIG), /link/iu);
  assert.equal(await readFile(outsideStore.configPath, "utf8"), original);
});

test("rejects oversized appearance files without replacing them", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "side-glance-config-large-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const store = new FileSideGlanceConfig({
    directory,
    rootDirectory: path.dirname(directory),
  });
  await store.write(DEFAULT_SIDE_GLANCE_CONFIG);
  const oversized = "x".repeat(65_537);
  await writeFile(store.configPath, oversized);

  const inspection = await store.inspect();

  assert.equal(inspection.valid, false);
  assert.match(inspection.error ?? "", /exceeds 65536 bytes/u);
  assert.deepEqual(inspection.config, DEFAULT_SIDE_GLANCE_CONFIG);
  assert.equal((await readFile(store.configPath, "utf8")).length, oversized.length);
});

test("backs up an invalid appearance before guided repair", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "side-glance-config-repair-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const store = new FileSideGlanceConfig({
    directory,
    rootDirectory: path.dirname(directory),
  });
  await store.write(DEFAULT_SIDE_GLANCE_CONFIG);
  const invalid = '{"schemaVersion":1,"appearance":{"preset":"private-invalid"}}';
  await writeFile(store.configPath, invalid);

  const backupPath = await store.writeWithBackup(DEFAULT_SIDE_GLANCE_CONFIG);

  assert.ok(backupPath);
  assert.equal(await readFile(backupPath, "utf8"), invalid);
  assert.equal((await lstat(backupPath)).mode & 0o777, 0o600);
  assert.equal((await store.inspect()).valid, true);
});
