import type { Readable, Writable } from "node:stream";

import {
  DEFAULT_SIDE_GLANCE_CONFIG,
  FileSideGlanceConfig,
  parseSideGlanceConfig,
  resolveAppearance,
  type SideGlanceAppearance,
  type SideGlanceColorPair,
  type SideGlanceColorState,
  type SideGlanceConfig,
} from "../core/appearance.ts";
import type { SideGlanceState } from "../core/protocol.ts";
import { visualForPhase } from "../core/visual.ts";
import {
  createReadlineSetupPrompter,
  type PromptOutcome,
  type SetupPrompter,
} from "./prompts.ts";

const COLOR_STATES = [
  "inactive",
  "working",
  "waiting",
  "ready",
  "failed",
] as const;

const CUSTOM_DEFAULTS: Record<SideGlanceColorState, SideGlanceColorPair> = {
  inactive: { wash: "101313", accent: "71807d" },
  working: { wash: "16352f", accent: "009d89" },
  waiting: { wash: "4d3510", accent: "f0a726" },
  ready: { wash: "173326", accent: "3fa84e" },
  failed: { wash: "732018", accent: "f33533" },
};

export interface ThemeCommandDependencies {
  configStore: FileSideGlanceConfig;
  state: SideGlanceState;
  interactive: boolean;
  input: Readable;
  output: Writable;
  signal?: AbortSignal;
}

export function themeHelpText(): string {
  return `Side Glance color themes

Usage:
  side-glance theme
  side-glance theme show --json
  side-glance theme set status --yes --json
  side-glance theme set heat --ceiling <adaptive|60..7200> --yes --json
  side-glance theme set custom --inactive <wash:accent> --working <wash:accent> --waiting <wash:accent> --ready <wash:accent> --failed <wash:accent> --yes --json
  side-glance theme preview --preset <status|heat> --elapsed <seconds> [--ceiling <seconds>] --json
  side-glance theme reset --yes --json

Status is the semantic default. Heat keeps turns under 10 seconds visually quiet;
longer successful Ready turns move from green toward red based on duration. Custom
requires exact six-digit hexadecimal wash:accent pairs. Invalid
configuration safely falls back to Status and is reported by doctor --json.
Active terminals use a saved theme on their next lifecycle event.
theme show --json reports each provider's sample count and learned ceiling.
`;
}

export async function runThemeCommand(
  args: readonly string[],
  dependencies: ThemeCommandDependencies,
): Promise<number> {
  const action = args[0];
  if (!action) {
    if (!dependencies.interactive) {
      throw new Error("theme requires an interactive terminal or a subcommand.");
    }
    return runInteractiveTheme(dependencies);
  }
  if (action === "--help" || action === "-h") {
    requireExact(args, [action], "theme help");
    dependencies.output.write(themeHelpText());
    return 0;
  }
  if (action === "show") {
    requireExact(args, ["show", "--json"], "theme show");
    writeJson(dependencies.output, {
      ...(await dependencies.configStore.inspect()),
      learnedCeilings: learnedCeilings(dependencies.state),
    });
    return 0;
  }
  if (action === "reset") {
    requireExact(args, ["reset", "--yes", "--json"], "theme reset");
    const inspection = await dependencies.configStore.inspect();
    const changed =
      !inspection.valid ||
      !sameAppearance(
        inspection.config.appearance,
        DEFAULT_SIDE_GLANCE_CONFIG.appearance,
      );
    const backupPath = changed
      ? inspection.valid
        ? (await dependencies.configStore.reset(), undefined)
        : await dependencies.configStore.writeWithBackup(
            DEFAULT_SIDE_GLANCE_CONFIG,
          )
      : undefined;
    writeJson(dependencies.output, {
      changed,
      configPath: dependencies.configStore.configPath,
      config: DEFAULT_SIDE_GLANCE_CONFIG,
      ...(backupPath ? { backupPath } : {}),
      appliesOn: "next-lifecycle-event",
    });
    return 0;
  }
  if (action === "set") return setTheme(args.slice(1), dependencies);
  if (action === "preview") return previewTheme(args.slice(1), dependencies);
  throw new Error("theme action must be show, set, preview, or reset.");
}

async function setTheme(
  args: readonly string[],
  dependencies: ThemeCommandDependencies,
): Promise<number> {
  const preset = args[0];
  if (!args.includes("--yes") || !args.includes("--json")) {
    throw new Error("theme set requires --yes --json.");
  }
  let appearance: SideGlanceAppearance;
  if (preset === "status") {
    requireExact(args, ["status", "--yes", "--json"], "theme set status");
    appearance = { preset: "status" };
  } else if (preset === "heat") {
    const ceilingValue = option(args, "--ceiling");
    requireOnly(
      args,
      ["heat"],
      new Set(["--ceiling"]),
      new Set(["--yes", "--json"]),
      "theme set heat",
    );
    appearance = {
      preset: "heat",
      ceiling:
        ceilingValue === "adaptive"
          ? { mode: "adaptive" }
          : { mode: "fixed", seconds: integerCeiling(ceilingValue) },
    };
  } else if (preset === "custom") {
    requireOnly(
      args,
      ["custom"],
      new Set(COLOR_STATES.map((state) => `--${state}`)),
      new Set(["--yes", "--json"]),
      "theme set custom",
    );
    appearance = {
      preset: "custom",
      colors: Object.fromEntries(
        COLOR_STATES.map((state) => [
          state,
          colorPair(option(args, `--${state}`), state),
        ]),
      ) as Record<SideGlanceColorState, SideGlanceColorPair>,
    };
  } else {
    throw new Error("theme set preset must be status, heat, or custom.");
  }

  const config = parseSideGlanceConfig({ schemaVersion: 1, appearance });
  const inspection = await dependencies.configStore.inspect();
  const changed =
    !inspection.valid ||
    !sameAppearance(inspection.config.appearance, config.appearance);
  const backupPath = changed
    ? inspection.valid
      ? (await dependencies.configStore.write(config), undefined)
      : await dependencies.configStore.writeWithBackup(config)
    : undefined;
  writeJson(dependencies.output, {
    changed,
    configPath: dependencies.configStore.configPath,
    config,
    ...(backupPath ? { backupPath } : {}),
    appliesOn: "next-lifecycle-event",
  });
  return 0;
}

function previewTheme(
  args: readonly string[],
  dependencies: ThemeCommandDependencies,
): number {
  const preset = option(args, "--preset");
  const elapsedSeconds = nonNegative(option(args, "--elapsed"), "elapsed");
  const suppliedCeiling = optionalOption(args, "--ceiling");
  requireOnly(
    args,
    [],
    new Set(["--preset", "--elapsed", "--ceiling"]),
    new Set(["--json"]),
    "theme preview",
  );
  const learnedCeilingSeconds = suppliedCeiling
    ? integerCeiling(suppliedCeiling)
    : 300;
  const appearance: SideGlanceAppearance =
    preset === "status"
      ? { preset: "status" }
      : preset === "heat"
        ? { preset: "heat", ceiling: { mode: "adaptive" } }
        : (() => {
            throw new Error("theme preview preset must be status or heat.");
          })();
  const resolved = resolveAppearance(appearance, learnedCeilingSeconds);
  writeJson(dependencies.output, {
    preset,
    elapsedSeconds,
    completionCeilingSeconds: resolved.completionCeilingSeconds,
    visual: visualForPhase(
      "completed",
      elapsedSeconds,
      resolved.completionCeilingSeconds,
      resolved.theme,
      resolved.suppressQuickCompletions,
    ),
  });
  return 0;
}

async function runInteractiveTheme(
  dependencies: ThemeCommandDependencies,
): Promise<number> {
  const inspection = await dependencies.configStore.inspect();
  const currentAppearance = inspection.config.appearance;
  const prompter = createReadlineSetupPrompter({
    input: dependencies.input,
    output: dependencies.output,
    environment: process.env,
    signal: dependencies.signal,
  });
  try {
    prompter.note("Side Glance colors");
    if (!inspection.valid) {
      prompter.note(
        `The current color configuration is invalid. Status is active until it is repaired.\n${inspection.error ?? "The configuration could not be read safely."}`,
      );
    }
    const selected = await prompter.select("What should colors communicate?", [
      {
        id: "status",
        label: `Status — Ready is green; failure is red${currentAppearance.preset === "status" ? " (current)" : " (recommended)"}`,
        selected: currentAppearance.preset === "status",
      },
      {
        id: "heat",
        label: `Heat — Turns under 10s stay quiet; longer Ready turns heat up${currentAppearance.preset === "heat" ? " (current)" : ""}`,
        selected: currentAppearance.preset === "heat",
      },
      {
        id: "custom",
        label: `Custom — Choose one color for each lifecycle state${currentAppearance.preset === "custom" ? " (current)" : ""}`,
        selected: currentAppearance.preset === "custom",
      },
      { id: "exit", label: "Exit without changing colors" },
    ]);
    if (selected.status !== "value") return cancelled(prompter);
    if (selected.value === "exit") return cancelled(prompter);

    let appearance: SideGlanceAppearance;
    if (selected.value === "status") {
      appearance = { preset: "status" };
    } else if (selected.value === "heat") {
      const ceiling = await prompter.select("How should Heat set its ceiling?", [
        {
          id: "adaptive",
          label: `Adaptive — learn from 12 recent turns${currentAppearance.preset === "heat" && currentAppearance.ceiling.mode === "adaptive" ? " (current)" : " (recommended)"}`,
          selected:
            currentAppearance.preset !== "heat" ||
            currentAppearance.ceiling.mode === "adaptive",
        },
        {
          id: "fixed",
          label: `Fixed — use one duration${currentAppearance.preset === "heat" && currentAppearance.ceiling.mode === "fixed" ? ` (current: ${formatDuration(currentAppearance.ceiling.seconds)})` : ""}`,
          selected:
            currentAppearance.preset === "heat" &&
            currentAppearance.ceiling.mode === "fixed",
        },
      ]);
      if (ceiling.status !== "value") return cancelled(prompter);
      if (ceiling.value === "adaptive") {
        appearance = { preset: "heat", ceiling: { mode: "adaptive" } };
      } else {
        const seconds = await promptFixedCeiling(
          prompter,
          currentAppearance.preset === "heat" &&
            currentAppearance.ceiling.mode === "fixed"
            ? currentAppearance.ceiling.seconds
            : 300,
        );
        if (seconds.status !== "value") return cancelled(prompter);
        appearance = {
          preset: "heat",
          ceiling: { mode: "fixed", seconds: seconds.value },
        };
      }
    } else {
      const colors = {} as Record<SideGlanceColorState, SideGlanceColorPair>;
      for (const state of COLOR_STATES) {
        const initial =
          currentAppearance.preset === "custom"
            ? currentAppearance.colors[state]
            : CUSTOM_DEFAULTS[state];
        const answer = await promptColorPair(prompter, state, initial);
        if (answer.status !== "value") return cancelled(prompter);
        colors[state] = answer.value;
      }
      appearance = { preset: "custom", colors };
    }

    prompter.detail?.(reviewText(appearance, dependencies.state));
    const confirmed = await prompter.confirm("Apply these colors?", true);
    if (confirmed.status !== "value" || !confirmed.value) {
      return cancelled(prompter);
    }
    const config: SideGlanceConfig = { schemaVersion: 1, appearance };
    if (inspection.valid && sameAppearance(currentAppearance, appearance)) {
      prompter.note("Colors unchanged.");
    } else {
      const backupPath = inspection.valid
        ? (await dependencies.configStore.write(config), undefined)
        : await dependencies.configStore.writeWithBackup(config);
      prompter.note("Colors updated.");
      if (backupPath) prompter.detail?.(`Previous configuration backed up: ${backupPath}`);
    }
    prompter.detail?.(
      "Active terminals update on their next lifecycle event.\nInspect or preview anytime: side-glance theme show --json",
    );
    return 0;
  } finally {
    prompter.close();
  }
}

async function promptFixedCeiling(
  prompter: SetupPrompter,
  initialSeconds: number,
): Promise<PromptOutcome<number>> {
  while (true) {
    const answer = await prompter.text(
      "Fixed ceiling in seconds",
      String(initialSeconds),
    );
    if (answer.status !== "value") return answer;
    try {
      return { status: "value", value: integerCeiling(answer.value) };
    } catch (error) {
      prompter.note(errorMessage(error));
    }
  }
}

async function promptColorPair(
  prompter: SetupPrompter,
  state: SideGlanceColorState,
  initial: SideGlanceColorPair,
): Promise<PromptOutcome<SideGlanceColorPair>> {
  while (true) {
    const answer = await prompter.text(
      `${capitalize(state)} wash:accent`,
      `${initial.wash}:${initial.accent}`,
    );
    if (answer.status !== "value") return answer;
    try {
      return { status: "value", value: colorPair(answer.value, state) };
    } catch (error) {
      prompter.note(errorMessage(error));
    }
  }
}

function reviewText(appearance: SideGlanceAppearance, state: SideGlanceState): string {
  if (appearance.preset === "status") {
    return [
      "Colors: Status",
      "  Working cyan · Waiting amber · Ready green · Failed red · Inactive neutral",
    ].join("\n");
  }
  if (appearance.preset === "custom") {
    return [
      "Colors: Custom",
      ...COLOR_STATES.map(
        (colorState) =>
          `  ${capitalize(colorState)}: ${appearance.colors[colorState].wash}:${appearance.colors[colorState].accent}`,
      ),
    ].join("\n");
  }
  const profiles = Object.entries(state.durationProfiles)
    .map(([source, profile]) => `${source} ${formatDuration(profile?.ceilingSeconds ?? 300)}`)
    .join(" · ");
  return [
    "Colors: Heat",
    appearance.ceiling.mode === "adaptive"
      ? `  Completion ceiling: Adaptive${profiles ? ` · ${profiles}` : " · cold start 5m"}`
      : `  Completion ceiling: Fixed · ${formatDuration(appearance.ceiling.seconds)}`,
    "  Ready under 10s: visually quiet; longer Ready turns heat green → red",
    "  Failure: always red",
  ].join("\n");
}

function sameAppearance(
  left: SideGlanceAppearance,
  right: SideGlanceAppearance,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function learnedCeilings(state: SideGlanceState): Record<
  string,
  { sampleCount: number; completionCeilingSeconds: number }
> {
  return Object.fromEntries(
    Object.entries(state.durationProfiles).flatMap(([source, profile]) =>
      profile
        ? [
            [
              source,
              {
                sampleCount: profile.samplesSeconds.length,
                completionCeilingSeconds: profile.ceilingSeconds,
              },
            ],
          ]
        : [],
    ),
  );
}

function cancelled(prompter: SetupPrompter): number {
  prompter.note("No color changes were made.");
  return 0;
}

function colorPair(value: string, state: string): SideGlanceColorPair {
  const [wash, accent, extra] = value.split(":");
  if (extra !== undefined || !wash || !accent) {
    throw new Error(`${state} colors must use wash:accent hexadecimal values.`);
  }
  const parsed = parseSideGlanceConfig({
    schemaVersion: 1,
    appearance: {
      preset: "custom",
      colors: Object.fromEntries(
        COLOR_STATES.map((colorState) => [
          colorState,
          colorState === state ? { wash, accent } : CUSTOM_DEFAULTS[colorState],
        ]),
      ),
    },
  });
  if (parsed.appearance.preset !== "custom") throw new Error("Invalid colors.");
  return parsed.appearance.colors[state as SideGlanceColorState];
}

function integerCeiling(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 60 || parsed > 7_200) {
    throw new Error("Heat ceiling must be an integer from 60 to 7200 seconds.");
  }
  return parsed;
}

function nonNegative(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return parsed;
}

function option(args: readonly string[], name: string): string {
  const value = optionalOption(args, name);
  if (value === undefined) throw new Error(`${name} requires a value.`);
  return value;
}

function optionalOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function requireExact(
  actual: readonly string[],
  expected: readonly string[],
  command: string,
): void {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(`${command} expects ${expected.join(" ")}.`);
  }
}

function requireOnly(
  args: readonly string[],
  positionals: readonly string[],
  valueOptions: ReadonlySet<string>,
  booleanOptions: ReadonlySet<string>,
  command: string,
): void {
  let positionalIndex = 0;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (valueOptions.has(argument)) {
      if (!args[index + 1] || args[index + 1].startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }
      index += 1;
      continue;
    }
    if (booleanOptions.has(argument)) continue;
    if (argument === positionals[positionalIndex]) {
      positionalIndex += 1;
      continue;
    }
    throw new Error(`${command} received an unknown option: ${argument}.`);
  }
  if (positionalIndex !== positionals.length) {
    throw new Error(`${command} is missing its preset.`);
  }
}

function writeJson(output: Writable, value: unknown): void {
  output.write(`${JSON.stringify(value)}\n`);
}

function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

function formatDuration(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Choose a valid value.";
}
