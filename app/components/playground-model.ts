import type { SideGlancePhase } from "../../src/core/protocol.ts";
import {
  DEFAULT_SIDE_GLANCE_THEME,
  HEAT_SIDE_GLANCE_THEME,
} from "../../src/core/theme.ts";
import { visualForPhase as coreVisualForPhase } from "../../src/core/visual.ts";

export type PlaygroundPhase = SideGlancePhase;
export type PlaygroundChannel = "terminal" | "tmux" | "both";
export type PlaygroundAppearance = "status" | "heat";

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
  appearance: PlaygroundAppearance = "status"
): PlaygroundVisual {
  const usesHeat = appearance === "heat";
  const visual = coreVisualForPhase(
    phase,
    elapsedSeconds,
    300,
    usesHeat ? HEAT_SIDE_GLANCE_THEME : DEFAULT_SIDE_GLANCE_THEME,
    usesHeat
  );
  const visibleVisual = visual.suppressed
    ? {
        ...visual,
        wash: HEAT_SIDE_GLANCE_THEME.inactiveWash,
        accent: HEAT_SIDE_GLANCE_THEME.inactiveAccent,
      }
    : visual;
  switch (phase) {
    case "working":
      return {
        phase,
        label: "Working",
        message: "The agent is in motion.",
        wash: visibleVisual.wash,
        accent: visibleVisual.accent,
        urgency: visibleVisual.urgency,
      };
    case "waiting":
      return {
        phase,
        label: "Waiting",
        message: "Your agent needs a decision.",
        wash: visibleVisual.wash,
        accent: visibleVisual.accent,
        urgency: visibleVisual.urgency,
      };
    case "completed":
      return {
        phase,
        label: "Ready",
        message: "The turn finished. Side Glance is holding your place.",
        wash: visibleVisual.wash,
        accent: visibleVisual.accent,
        urgency: visibleVisual.urgency,
      };
    case "failed":
      return {
        phase,
        label: "Failed",
        message: "The turn stopped before completion.",
        wash: visibleVisual.wash,
        accent: visibleVisual.accent,
        urgency: visibleVisual.urgency,
      };
    case "inactive":
      return {
        phase,
        label: "Inactive",
        message: "No session owns this surface.",
        wash: visibleVisual.wash,
        accent: visibleVisual.accent,
        urgency: visibleVisual.urgency,
      };
  }
}
