import type { SideGlancePhase } from "../../src/core/protocol.ts";
import { urgencyFromElapsed } from "../../src/core/policy.ts";
import { DEFAULT_SIDE_GLANCE_THEME } from "../../src/core/theme.ts";

export type PlaygroundPhase = SideGlancePhase;
export type PlaygroundChannel = "terminal" | "tmux" | "both";

export interface PlaygroundVisual {
  phase: PlaygroundPhase;
  label: string;
  message: string;
  wash: string;
  accent: string;
  urgency: number;
}

export function visualForPhase(
  phase: PlaygroundPhase,
  elapsedSeconds: number,
): PlaygroundVisual {
  switch (phase) {
    case "working":
      return {
        phase,
        label: "Working",
        message: "The agent is in motion.",
        wash: DEFAULT_SIDE_GLANCE_THEME.workingWash,
        accent: DEFAULT_SIDE_GLANCE_THEME.workingAccent,
        urgency: 0,
      };
    case "waiting":
      return {
        phase,
        label: "Waiting",
        message: "Your agent needs a decision.",
        wash: DEFAULT_SIDE_GLANCE_THEME.waitingWash,
        accent: DEFAULT_SIDE_GLANCE_THEME.waitingAccent,
        urgency: 0,
      };
    case "completed": {
      const thermal = urgencyFromElapsed(elapsedSeconds, 120);
      return {
        phase,
        label: "Ready",
        message: "The turn finished. Side Glance is holding your place.",
        wash: thermal.wash,
        accent: thermal.accent,
        urgency: thermal.urgency,
      };
    }
    case "failed":
      return {
        phase,
        label: "Failed",
        message: "The turn stopped before completion.",
        wash: DEFAULT_SIDE_GLANCE_THEME.washStops.at(-1) ?? "732018",
        accent: DEFAULT_SIDE_GLANCE_THEME.tmuxStops.at(-1) ?? "f33533",
        urgency: 1_000,
      };
    case "inactive":
      return {
        phase,
        label: "Inactive",
        message: "No session owns this surface.",
        wash: "101313",
        accent: "71807d",
        urgency: 0,
      };
  }
}
