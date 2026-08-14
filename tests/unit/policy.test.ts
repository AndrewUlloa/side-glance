import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_URGENCY_POLICY,
  urgencyFromElapsed,
  validateUrgencyPolicy,
} from "../../src/core/policy.ts";

test("preserves the original thermal ramp anchors", () => {
  assert.deepEqual(urgencyFromElapsed(5), {
    suppressed: true,
    urgency: 0,
    wash: "142e2d",
    accent: "009d89",
  });
  assert.deepEqual(urgencyFromElapsed(60), {
    suppressed: false,
    urgency: 500,
    wash: "3a2f16",
    accent: "e0a726",
  });
  assert.deepEqual(urgencyFromElapsed(300), {
    suppressed: false,
    urgency: 1_000,
    wash: "732018",
    accent: "f33533",
  });
});

test("keeps urgency bounded and monotonic", () => {
  const elapsed = [0, 5, 10, 30, 60, 120, 300, 3_000];
  const values = elapsed.map(
    (seconds) => urgencyFromElapsed(seconds, 120).urgency,
  );

  assert.deepEqual(values, [...values].sort((a, b) => a - b));
  assert.ok(values.every((value) => value >= 0 && value <= 1_000));
});

test("makes reliably tended sessions heat more slowly", () => {
  const normallyTended = urgencyFromElapsed(90, 60);
  const quicklyTended = urgencyFromElapsed(90, 15);

  assert.ok(quicklyTended.urgency < normallyTended.urgency);
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
