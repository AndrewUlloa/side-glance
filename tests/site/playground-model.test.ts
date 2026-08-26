import assert from "node:assert/strict";
import test from "node:test";

import { visualForPhase } from "../../app/components/playground-model.ts";
import { DEFAULT_SIDE_GLANCE_THEME } from "../../src/core/theme.ts";

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
