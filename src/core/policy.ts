import { DEFAULT_SIDE_GLANCE_THEME, type SideGlanceTheme } from "./theme.ts";

export interface UrgencyPolicy {
  suppressBelowSeconds: number;
  midpointSeconds: number;
  maximumSeconds: number;
  adaptive: boolean;
  theme: SideGlanceTheme;
}

export interface UrgencyResult {
  suppressed: boolean;
  urgency: number;
  wash: string;
  accent: string;
}

export const DEFAULT_URGENCY_POLICY: UrgencyPolicy = {
  suppressBelowSeconds: 10,
  midpointSeconds: 60,
  maximumSeconds: 300,
  adaptive: true,
  theme: DEFAULT_SIDE_GLANCE_THEME,
};

export function validateUrgencyPolicy(policy: UrgencyPolicy): void {
  const {
    suppressBelowSeconds,
    midpointSeconds,
    maximumSeconds,
    adaptive,
    theme,
  } = policy;
  const thresholds = [
    suppressBelowSeconds,
    midpointSeconds,
    maximumSeconds,
  ];

  if (
    thresholds.some((threshold) => !Number.isFinite(threshold) || threshold <= 0) ||
    !(suppressBelowSeconds < midpointSeconds && midpointSeconds < maximumSeconds)
  ) {
    throw new Error(
      "Urgency thresholds must be finite, positive, and strictly increasing.",
    );
  }

  if (typeof adaptive !== "boolean") {
    throw new Error("Urgency adaptive mode must be a boolean.");
  }

  if (theme.washStops.length !== theme.tmuxStops.length) {
    throw new Error("Wash and tmux palettes must contain the same number of colors.");
  }

  if (theme.washStops.length < 2) {
    throw new Error("Urgency palettes must contain at least two colors.");
  }

  const colors = [
    ...theme.washStops,
    ...theme.tmuxStops,
    theme.workingWash,
    theme.waitingWash,
    theme.workingAccent,
    theme.waitingAccent,
    theme.failedWash,
    theme.failedAccent,
    theme.inactiveWash,
    theme.inactiveAccent,
  ];

  if (colors.some((color) => !/^[0-9a-f]{6}$/i.test(color))) {
    throw new Error("Side Glance theme colors must be six-digit hexadecimal values.");
  }
}

export function urgencyFromElapsed(
  elapsedSeconds: number,
  completionCeilingSeconds = 300,
  policy = DEFAULT_URGENCY_POLICY,
): UrgencyResult {
  validateUrgencyPolicy(policy);

  const elapsed = Number.isFinite(elapsedSeconds)
    ? Math.max(0, elapsedSeconds)
    : 0;
  const ceiling = Number.isFinite(completionCeilingSeconds)
    ? Math.min(7_200, Math.max(60, completionCeilingSeconds))
    : policy.maximumSeconds;
  const urgency = urgencyRatio(elapsed, policy, ceiling);

  return {
    suppressed: elapsed < policy.suppressBelowSeconds,
    urgency: Math.round(urgency * 1_000),
    wash: interpolatePalette(policy.theme.washStops, urgency),
    accent: interpolatePalette(policy.theme.tmuxStops, urgency),
  };
}

function urgencyRatio(
  elapsed: number,
  policy: UrgencyPolicy,
  ceiling: number,
): number {
  const { suppressBelowSeconds } = policy;
  const midpointSeconds = Math.max(20, ceiling / 5);

  if (elapsed < suppressBelowSeconds) return 0;
  if (elapsed >= ceiling) return 1;

  if (elapsed < midpointSeconds) {
    return (
      (0.5 * Math.log(elapsed / suppressBelowSeconds)) /
      Math.log(midpointSeconds / suppressBelowSeconds)
    );
  }

  return (
    0.5 +
    (0.5 * Math.log(elapsed / midpointSeconds)) /
      Math.log(ceiling / midpointSeconds)
  );
}

function interpolatePalette(colors: readonly string[], urgency: number): string {
  const position = urgency * (colors.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.min(lowerIndex + 1, colors.length - 1);
  const amount = position - lowerIndex;

  return interpolateColor(colors[lowerIndex], colors[upperIndex], amount);
}

function interpolateColor(from: string, to: string, amount: number): string {
  const channels = [0, 2, 4].map((offset) => {
    const start = Number.parseInt(from.slice(offset, offset + 2), 16);
    const end = Number.parseInt(to.slice(offset, offset + 2), 16);
    return Math.round(start + (end - start) * amount)
      .toString(16)
      .padStart(2, "0");
  });

  return channels.join("");
}
