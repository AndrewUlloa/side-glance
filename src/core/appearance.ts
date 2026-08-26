import path from "node:path";

import {
  applyConfigTargetPlan,
  captureConfigTarget,
  planConfigTarget,
  revalidateConfigTargetSnapshot,
  sensitiveConfigTargetSnapshotBytes,
  type ConfigTargetSnapshot,
} from "../adapters/config-target.ts";

import {
  DEFAULT_SIDE_GLANCE_THEME,
  HEAT_SIDE_GLANCE_THEME,
  type SideGlanceTheme,
} from "./theme.ts";

const CONFIG_FILENAME = "config.json";
const MAX_CONFIG_BYTES = 65_536;
const COLOR_STATES = [
  "inactive",
  "working",
  "waiting",
  "ready",
  "failed",
] as const;

export type SideGlanceColorState = (typeof COLOR_STATES)[number];

export interface SideGlanceColorPair {
  wash: string;
  accent: string;
}

export type SideGlanceAppearance =
  | { preset: "status" }
  | {
      preset: "heat";
      ceiling:
        | { mode: "adaptive" }
        | { mode: "fixed"; seconds: number };
    }
  | {
      preset: "custom";
      colors: Record<SideGlanceColorState, SideGlanceColorPair>;
    };

export interface SideGlanceConfig {
  schemaVersion: 1;
  appearance: SideGlanceAppearance;
}

export interface SideGlanceConfigInspection {
  configPath: string;
  exists: boolean;
  valid: boolean;
  config: SideGlanceConfig;
  error?: string;
}

export const DEFAULT_SIDE_GLANCE_CONFIG: SideGlanceConfig = {
  schemaVersion: 1,
  appearance: { preset: "status" },
};

export function parseSideGlanceConfig(value: unknown): SideGlanceConfig {
  const config = record(value, "Side Glance config");
  rejectUnknown(config, new Set(["schemaVersion", "appearance"]), "Side Glance config");
  if (config.schemaVersion !== 1) {
    throw new Error("Side Glance config schemaVersion must be 1.");
  }
  return { schemaVersion: 1, appearance: parseAppearance(config.appearance) };
}

export function resolveAppearance(
  appearance: SideGlanceAppearance,
  learnedCeilingSeconds: number,
): {
  theme: SideGlanceTheme;
  completionCeilingSeconds: number;
  suppressQuickCompletions: boolean;
} {
  if (appearance.preset === "status") {
    return {
      theme: DEFAULT_SIDE_GLANCE_THEME,
      completionCeilingSeconds: boundedCeiling(learnedCeilingSeconds),
      suppressQuickCompletions: false,
    };
  }
  if (appearance.preset === "heat") {
    return {
      theme: HEAT_SIDE_GLANCE_THEME,
      completionCeilingSeconds:
        appearance.ceiling.mode === "adaptive"
          ? boundedCeiling(learnedCeilingSeconds)
          : appearance.ceiling.seconds,
      suppressQuickCompletions: true,
    };
  }

  const { colors } = appearance;
  return {
    theme: {
      washStops: [colors.ready.wash, colors.ready.wash],
      tmuxStops: [colors.ready.accent, colors.ready.accent],
      workingWash: colors.working.wash,
      workingAccent: colors.working.accent,
      waitingWash: colors.waiting.wash,
      waitingAccent: colors.waiting.accent,
      failedWash: colors.failed.wash,
      failedAccent: colors.failed.accent,
      inactiveWash: colors.inactive.wash,
      inactiveAccent: colors.inactive.accent,
    },
    completionCeilingSeconds: boundedCeiling(learnedCeilingSeconds),
    suppressQuickCompletions: false,
  };
}

export class FileSideGlanceConfig {
  readonly directory: string;
  readonly configPath: string;
  private readonly rootDirectory: string;

  constructor(options: { directory: string; rootDirectory: string }) {
    if (!path.isAbsolute(options.directory) || !path.isAbsolute(options.rootDirectory)) {
      throw new Error("Side Glance config directory and trust root must be absolute paths.");
    }
    this.directory = path.resolve(options.directory);
    this.rootDirectory = path.resolve(options.rootDirectory);
    this.configPath = path.join(this.directory, CONFIG_FILENAME);
  }

  async inspect(): Promise<SideGlanceConfigInspection> {
    try {
      const snapshot = await this.capture();
      await revalidateConfigTargetSnapshot(snapshot);
      const bytes = sensitiveConfigTargetSnapshotBytes(snapshot);
      if (!bytes) {
        return {
          configPath: this.configPath,
          exists: false,
          valid: true,
          config: DEFAULT_SIDE_GLANCE_CONFIG,
        };
      }
      const config = parseSideGlanceConfig(JSON.parse(bytes.toString("utf8")));
      return {
        configPath: this.configPath,
        exists: true,
        valid: true,
        config,
      };
    } catch (error) {
      return {
        configPath: this.configPath,
        exists: true,
        valid: false,
        config: DEFAULT_SIDE_GLANCE_CONFIG,
        error: boundedError(error),
      };
    }
  }

  async write(value: SideGlanceConfig): Promise<void> {
    const config = parseSideGlanceConfig(value);
    const snapshot = await this.capture();
    const plan = planConfigTarget(snapshot, serializedConfig(config), {
      mode: 0o600,
    });
    await applyConfigTargetPlan(plan);
  }

  async reset(): Promise<void> {
    await this.write(DEFAULT_SIDE_GLANCE_CONFIG);
  }

  async writeWithBackup(value: SideGlanceConfig): Promise<string | undefined> {
    const config = parseSideGlanceConfig(value);
    const snapshot = await this.capture();
    const plan = planConfigTarget(snapshot, serializedConfig(config), {
      backupExisting: true,
      mode: 0o600,
    });
    return (await applyConfigTargetPlan(plan)).backupPath;
  }

  private async capture(): Promise<ConfigTargetSnapshot> {
    return captureConfigTarget({
      rootDirectory: this.rootDirectory,
      targetPath: this.configPath,
      label: "Side Glance color configuration",
      maxBytes: MAX_CONFIG_BYTES,
      defaultMode: 0o600,
    });
  }
}

function serializedConfig(config: SideGlanceConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

function parseAppearance(value: unknown): SideGlanceAppearance {
  const appearance = record(value, "Side Glance appearance");
  if (appearance.preset === "status") {
    rejectUnknown(appearance, new Set(["preset"]), "Side Glance appearance");
    return { preset: "status" };
  }
  if (appearance.preset === "heat") {
    rejectUnknown(
      appearance,
      new Set(["preset", "ceiling"]),
      "Side Glance appearance",
    );
    const ceiling = record(appearance.ceiling, "Heat ceiling");
    if (ceiling.mode === "adaptive") {
      rejectUnknown(ceiling, new Set(["mode"]), "Heat ceiling");
      return { preset: "heat", ceiling: { mode: "adaptive" } };
    }
    if (ceiling.mode === "fixed") {
      rejectUnknown(ceiling, new Set(["mode", "seconds"]), "Heat ceiling");
      return {
        preset: "heat",
        ceiling: { mode: "fixed", seconds: requireCeiling(ceiling.seconds) },
      };
    }
    throw new Error("Heat ceiling mode must be adaptive or fixed.");
  }
  if (appearance.preset === "custom") {
    rejectUnknown(
      appearance,
      new Set(["preset", "colors"]),
      "Side Glance appearance",
    );
    const colors = record(appearance.colors, "Custom colors");
    rejectUnknown(colors, new Set(COLOR_STATES), "Custom colors");
    for (const state of COLOR_STATES) {
      if (!(state in colors)) throw new Error(`Custom colors requires ${state}.`);
    }
    return {
      preset: "custom",
      colors: Object.fromEntries(
        COLOR_STATES.map((state) => [state, parseColorPair(colors[state], state)]),
      ) as Record<SideGlanceColorState, SideGlanceColorPair>,
    };
  }
  throw new Error("Side Glance appearance preset must be status, heat, or custom.");
}

function parseColorPair(value: unknown, state: string): SideGlanceColorPair {
  const pair = record(value, `${state} colors`);
  rejectUnknown(pair, new Set(["wash", "accent"]), `${state} colors`);
  return {
    wash: requireColor(pair.wash, `${state} wash`),
    accent: requireColor(pair.accent, `${state} accent`),
  };
}

function requireColor(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{6}$/iu.test(value)) {
    throw new Error(`${label} must be a six-digit hexadecimal color.`);
  }
  return value.toLowerCase();
}

function requireCeiling(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 60 || Number(value) > 7_200) {
    throw new Error("Fixed Heat ceiling must be an integer from 60 to 7200 seconds.");
  }
  return Number(value);
}

function boundedCeiling(value: number): number {
  return Number.isFinite(value)
    ? Math.min(7_200, Math.max(60, Math.round(value)))
    : 300;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknown(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`${label} contains unknown field: ${unknown}.`);
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Invalid Side Glance config.";
  if (/too large/iu.test(message)) {
    return `Side Glance config exceeds ${MAX_CONFIG_BYTES} bytes.`;
  }
  return [...message].slice(0, 240).join("");
}
