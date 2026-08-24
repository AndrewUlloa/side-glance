import type { SideGlancePhase } from "../../src/core/protocol.ts";
import { visualForPhase as coreVisualForPhase } from "../../src/core/visual.ts";

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
  elapsedSeconds: number
): PlaygroundVisual {
  const visual = coreVisualForPhase(phase, elapsedSeconds, 120);
  switch (phase) {
    case "working":
      return {
        phase,
        label: "Working",
        message: "The agent is in motion.",
        wash: visual.wash,
        accent: visual.accent,
        urgency: visual.urgency,
      };
    case "waiting":
      return {
        phase,
        label: "Waiting",
        message: "Your agent needs a decision.",
        wash: visual.wash,
        accent: visual.accent,
        urgency: visual.urgency,
      };
    case "completed":
      return {
        phase,
        label: "Ready",
        message: "The turn finished. Side Glance is holding your place.",
        wash: visual.wash,
        accent: visual.accent,
        urgency: visual.urgency,
      };
    case "failed":
      return {
        phase,
        label: "Failed",
        message: "The turn stopped before completion.",
        wash: visual.wash,
        accent: visual.accent,
        urgency: visual.urgency,
      };
    case "inactive":
      return {
        phase,
        label: "Inactive",
        message: "No session owns this surface.",
        wash: visual.wash,
        accent: visual.accent,
        urgency: visual.urgency,
      };
  }
}
