import type { SignalPhase } from "../../src/core/protocol.ts";
import { urgencyFromElapsed } from "../../src/core/policy.ts";
import { DEFAULT_SIGNAL_THEME } from "../../src/core/theme.ts";

export type PlaygroundPhase = SignalPhase;
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
        wash: DEFAULT_SIGNAL_THEME.workingWash,
        accent: DEFAULT_SIGNAL_THEME.workingAccent,
        urgency: 0,
      };
    case "waiting":
      return {
        phase,
        label: "Waiting",
        message: "Your agent needs a decision.",
        wash: DEFAULT_SIGNAL_THEME.waitingWash,
        accent: DEFAULT_SIGNAL_THEME.waitingAccent,
        urgency: 0,
      };
    case "completed": {
      const thermal = urgencyFromElapsed(elapsedSeconds, 120);
      return {
        phase,
        label: "Ready",
        message: "The turn finished. Signal is holding your place.",
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
        wash: DEFAULT_SIGNAL_THEME.washStops.at(-1) ?? "732018",
        accent: DEFAULT_SIGNAL_THEME.tmuxStops.at(-1) ?? "f33533",
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
