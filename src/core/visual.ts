import { urgencyFromElapsed } from "./policy.ts";
import type { SideGlancePhase } from "./protocol.ts";
import { DEFAULT_SIDE_GLANCE_THEME } from "./theme.ts";

export interface SurfaceVisual {
  wash: string;
  accent: string;
  urgency: number;
  suppressed: boolean;
}

export function visualForPhase(
  phase: SideGlancePhase,
  elapsedSeconds = 0,
  responseEwmaSeconds = 120,
): SurfaceVisual {
  switch (phase) {
    case "working":
      return {
        wash: DEFAULT_SIDE_GLANCE_THEME.workingWash,
        accent: DEFAULT_SIDE_GLANCE_THEME.workingAccent,
        urgency: 0,
        suppressed: false,
      };
    case "waiting":
      return {
        wash: DEFAULT_SIDE_GLANCE_THEME.waitingWash,
        accent: DEFAULT_SIDE_GLANCE_THEME.waitingAccent,
        urgency: 0,
        suppressed: false,
      };
    case "completed":
      return urgencyFromElapsed(elapsedSeconds, responseEwmaSeconds);
    case "failed":
      return {
        wash: DEFAULT_SIDE_GLANCE_THEME.washStops.at(-1) ?? "732018",
        accent: DEFAULT_SIDE_GLANCE_THEME.tmuxStops.at(-1) ?? "f33533",
        urgency: 1_000,
        suppressed: false,
      };
    case "inactive":
      return {
        wash: "101313",
        accent: "71807d",
        urgency: 0,
        suppressed: false,
      };
  }
}
