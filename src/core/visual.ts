import { DEFAULT_URGENCY_POLICY, urgencyFromElapsed } from "./policy.ts";
import type { SideGlancePhase } from "./protocol.ts";
import {
  DEFAULT_SIDE_GLANCE_THEME,
  type SideGlanceTheme,
} from "./theme.ts";

export interface SurfaceVisual {
  wash: string;
  accent: string;
  urgency: number;
  suppressed: boolean;
}

export function visualForPhase(
  phase: SideGlancePhase,
  elapsedSeconds = 0,
  completionCeilingSeconds = 300,
  theme: SideGlanceTheme = DEFAULT_SIDE_GLANCE_THEME,
  suppressQuickCompletions = false,
): SurfaceVisual {
  switch (phase) {
    case "working":
      return {
        wash: theme.workingWash,
        accent: theme.workingAccent,
        urgency: 0,
        suppressed: false,
      };
    case "waiting":
      return {
        wash: theme.waitingWash,
        accent: theme.waitingAccent,
        urgency: 0,
        suppressed: false,
      };
    case "completed": {
      const visual = urgencyFromElapsed(elapsedSeconds, completionCeilingSeconds, {
        ...DEFAULT_URGENCY_POLICY,
        theme,
      });
      return {
        ...visual,
        suppressed: suppressQuickCompletions && visual.suppressed,
      };
    }
    case "failed":
      return {
        wash: theme.failedWash,
        accent: theme.failedAccent,
        urgency: 1_000,
        suppressed: false,
      };
    case "inactive":
      return {
        wash: theme.inactiveWash,
        accent: theme.inactiveAccent,
        urgency: 0,
        suppressed: false,
      };
  }
}
