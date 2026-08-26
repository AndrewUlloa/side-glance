import type { SideGlanceDurationProfile } from "./protocol.ts";

export const DURATION_HISTORY_LIMIT = 12;
export const DURATION_MINIMUM_SAMPLES = 8;
export const DURATION_COLD_CEILING_SECONDS = 300;
export const DURATION_MINIMUM_CEILING_SECONDS = 60;
export const DURATION_MAXIMUM_CEILING_SECONDS = 7_200;
export const DURATION_MINIMUM_SAMPLE_SECONDS = 1;
export const DURATION_MAXIMUM_SAMPLE_SECONDS = 28_800;

export function createDurationProfile(): SideGlanceDurationProfile {
  return {
    algorithmVersion: 1,
    samplesSeconds: [],
    ceilingSeconds: DURATION_COLD_CEILING_SECONDS,
  };
}

export function updateDurationProfile(
  profile: SideGlanceDurationProfile,
  durationSeconds: number,
): SideGlanceDurationProfile {
  if (!eligibleDurationSample(durationSeconds)) return profile;

  const sample = Math.round(durationSeconds);
  const samplesSeconds = [...profile.samplesSeconds, sample].slice(
    -DURATION_HISTORY_LIMIT,
  );
  if (samplesSeconds.length < DURATION_MINIMUM_SAMPLES) {
    return {
      algorithmVersion: 1,
      samplesSeconds,
      ceilingSeconds: DURATION_COLD_CEILING_SECONDS,
    };
  }

  const sorted = [...samplesSeconds].sort((left, right) => left - right);
  const percentileIndex = Math.ceil(0.8 * sorted.length) - 1;
  const percentile = sorted[percentileIndex];
  const candidate = clamp(
    Math.round(percentile * 1.5),
    DURATION_MINIMUM_CEILING_SECONDS,
    DURATION_MAXIMUM_CEILING_SECONDS,
  );
  const current = profile.ceilingSeconds;
  const upwardLimit = Math.max(30, Math.floor(current * 0.2));
  const downwardLimit = Math.max(15, Math.floor(current * 0.1));
  const movement = clamp(candidate - current, -downwardLimit, upwardLimit);

  return {
    algorithmVersion: 1,
    samplesSeconds,
    ceilingSeconds: clamp(
      current + movement,
      DURATION_MINIMUM_CEILING_SECONDS,
      DURATION_MAXIMUM_CEILING_SECONDS,
    ),
  };
}

export function eligibleDurationSample(durationSeconds: number): boolean {
  return (
    Number.isFinite(durationSeconds) &&
    durationSeconds >= DURATION_MINIMUM_SAMPLE_SECONDS &&
    durationSeconds <= DURATION_MAXIMUM_SAMPLE_SECONDS
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
