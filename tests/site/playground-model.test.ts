import assert from "node:assert/strict";
import test from "node:test";

import { visualForPhase } from "../../app/components/playground-model.ts";
import {
  DEFAULT_SIDE_GLANCE_THEME,
  HEAT_SIDE_GLANCE_THEME,
} from "../../src/core/theme.ts";

test("uses the shared core theme for working and waiting states", () => {
  assert.deepEqual(visualForPhase("working", 90), {
    phase: "working",
    label: "Working",
    message: "The agent is in motion.",
    wash: DEFAULT_SIDE_GLANCE_THEME.workingWash,
    accent: DEFAULT_SIDE_GLANCE_THEME.workingAccent,
    urgency: 0,
  });
  assert.deepEqual(visualForPhase("waiting", 90), {
    phase: "waiting",
    label: "Waiting",
    message: "Your agent needs a decision.",
    wash: DEFAULT_SIDE_GLANCE_THEME.waitingWash,
    accent: DEFAULT_SIDE_GLANCE_THEME.waitingAccent,
    urgency: 0,
  });
});

test("uses semantic Ready while retaining bounded duration metadata", () => {
  assert.deepEqual(visualForPhase("completed", 60), {
    phase: "completed",
    label: "Ready",
    message: "The turn finished. Side Glance is holding your place.",
    wash: "173326",
    accent: "3fa84e",
    urgency: 500,
  });
  assert.equal(visualForPhase("completed", 300).accent, "3fa84e");
});

test("lets the website preview the production Heat ramp without changing Status", () => {
  const statusShort = visualForPhase("completed", 18, "status");
  const statusLong = visualForPhase("completed", 1122, "status");
  const heatShort = visualForPhase("completed", 18, "heat");
  const heatLong = visualForPhase("completed", 1122, "heat");
  const heatQuiet = visualForPhase("completed", 5, "heat");

  assert.equal(statusShort.accent, DEFAULT_SIDE_GLANCE_THEME.tmuxStops[0]);
  assert.equal(statusLong.accent, statusShort.accent);
  assert.equal(heatShort.accent, "3ea84f");
  assert.equal(heatLong.accent, HEAT_SIDE_GLANCE_THEME.failedAccent);
  assert.notEqual(heatShort.accent, heatLong.accent);
  assert.equal(heatQuiet.accent, HEAT_SIDE_GLANCE_THEME.inactiveAccent);
});

test("keeps failure urgent and inactive truly neutral", () => {
  assert.deepEqual(visualForPhase("failed", 0), {
    phase: "failed",
    label: "Failed",
    message: "The turn stopped before completion.",
    wash: "732018",
    accent: "f33533",
    urgency: 1000,
  });
  assert.deepEqual(visualForPhase("inactive", 0), {
    phase: "inactive",
    label: "Inactive",
    message: "No session owns this surface.",
    wash: "101313",
    accent: "71807d",
    urgency: 0,
  });
});
