import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_URGENCY_POLICY,
  urgencyFromElapsed,
  validateUrgencyPolicy,
} from "../../src/core/policy.ts";
import {
  createDurationProfile,
  updateDurationProfile,
} from "../../src/core/duration-profile.ts";
import {
  DEFAULT_SIDE_GLANCE_THEME,
  HEAT_SIDE_GLANCE_THEME,
} from "../../src/core/theme.ts";
import { visualForPhase } from "../../src/core/visual.ts";

test("uses semantic lifecycle colors by default at every Ready duration", () => {
  const quick = visualForPhase("completed", 5);
  const short = visualForPhase("completed", 18);
  const long = visualForPhase("completed", 1_122);
  const failed = visualForPhase("failed", 1_122);

  assert.equal(quick.suppressed, false);
  assert.equal(short.wash, DEFAULT_SIDE_GLANCE_THEME.washStops[0]);
  assert.equal(short.accent, DEFAULT_SIDE_GLANCE_THEME.tmuxStops[0]);
  assert.equal(long.wash, short.wash);
  assert.equal(long.accent, short.accent);
  assert.notEqual(failed.wash, long.wash);
  assert.equal(failed.accent, "f33533");
});

test("keeps quick-completion suppression exclusive to Heat", () => {
  const customTheme = {
    ...DEFAULT_SIDE_GLANCE_THEME,
    washStops: ["113311", "113311"],
    tmuxStops: ["44cc44", "44cc44"],
  };

  assert.equal(visualForPhase("completed", 5, 300, customTheme).suppressed, false);
  assert.equal(
    visualForPhase("completed", 5, 300, HEAT_SIDE_GLANCE_THEME, true).suppressed,
    true,
  );
});

test("preserves the original thermal ramp anchors only in Heat", () => {
  const heatPolicy = { ...DEFAULT_URGENCY_POLICY, theme: HEAT_SIDE_GLANCE_THEME };
  assert.deepEqual(urgencyFromElapsed(5, 300, heatPolicy), {
    suppressed: true,
    urgency: 0,
    wash: "142e2d",
    accent: "009d89",
  });
  assert.deepEqual(urgencyFromElapsed(60, 300, heatPolicy), {
    suppressed: false,
    urgency: 500,
    wash: "3a2f16",
    accent: "e0a726",
  });
  assert.deepEqual(urgencyFromElapsed(300, 300, heatPolicy), {
    suppressed: false,
    urgency: 1_000,
    wash: "732018",
    accent: "f33533",
  });
});

test("keeps urgency bounded and monotonic", () => {
  const elapsed = [0, 5, 10, 30, 60, 120, 300, 3_000];
  const values = elapsed.map((seconds) => urgencyFromElapsed(seconds, 300).urgency);

  assert.deepEqual(values, [...values].sort((a, b) => a - b));
  assert.ok(values.every((value) => value >= 0 && value <= 1_000));
});

test("moves a genuinely sliding ceiling only after eight bounded samples", () => {
  let profile = createDurationProfile();
  for (let index = 0; index < 7; index += 1) {
    profile = updateDurationProfile(profile, 400);
    assert.equal(profile.ceilingSeconds, 300);
  }
  profile = updateDurationProfile(profile, 400);

  assert.equal(profile.ceilingSeconds, 360);
  assert.deepEqual(profile.samplesSeconds, Array.from({ length: 8 }, () => 400));
});

test("resists one high outlier and rate-limits downward movement", () => {
  let profile = createDurationProfile();
  for (const duration of [60, 60, 60, 60, 60, 60, 60, 7_200]) {
    profile = updateDurationProfile(profile, duration);
  }

  assert.equal(profile.ceilingSeconds, 270);
  assert.equal(profile.samplesSeconds.length, 8);
});

test("retains only the newest twelve duration samples", () => {
  let profile = createDurationProfile();
  for (let duration = 1; duration <= 13; duration += 1) {
    profile = updateDurationProfile(profile, duration);
  }

  assert.deepEqual(profile.samplesSeconds, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
});

test("accepts exact duration boundaries and rejects values outside them", () => {
  const cold = createDurationProfile();
  assert.strictEqual(updateDurationProfile(cold, 0.999), cold);
  assert.strictEqual(updateDurationProfile(cold, 28_800.001), cold);

  let profile = updateDurationProfile(cold, 1);
  profile = updateDurationProfile(profile, 28_800);
  assert.deepEqual(profile.samplesSeconds, [1, 28_800]);
  assert.equal(profile.ceilingSeconds, 300);
});

test("keeps the sliding ceiling inside its exact one-minute and two-hour bounds", () => {
  let minimum = createDurationProfile();
  let maximum = createDurationProfile();
  for (let index = 0; index < 80; index += 1) {
    minimum = updateDurationProfile(minimum, 1);
    maximum = updateDurationProfile(maximum, 28_800);
  }

  assert.equal(minimum.ceilingSeconds, 60);
  assert.equal(maximum.ceilingSeconds, 7_200);
});

test("rejects invalid thresholds and palettes before rendering", () => {
  assert.throws(
    () =>
      validateUrgencyPolicy({
        ...DEFAULT_URGENCY_POLICY,
        midpointSeconds: 10,
      }),
    /thresholds/i,
  );
  assert.throws(
    () =>
      validateUrgencyPolicy({
        ...DEFAULT_URGENCY_POLICY,
        theme: {
          ...DEFAULT_URGENCY_POLICY.theme,
          washStops: ["not-a-color", "ffffff"],
          tmuxStops: ["000000", "ffffff"],
        },
      }),
    /color/i,
  );
  assert.throws(
    () =>
      validateUrgencyPolicy({
        ...DEFAULT_URGENCY_POLICY,
        theme: {
          ...DEFAULT_URGENCY_POLICY.theme,
          washStops: ["000000", "333333", "ffffff"],
          tmuxStops: ["000000", "ffffff"],
        },
      }),
    /same number/i,
  );
});
