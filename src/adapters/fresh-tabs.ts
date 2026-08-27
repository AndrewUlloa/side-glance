import path from "node:path";

import {
  applyConfigTargetPlan,
  backupConfigTargetPlan,
  captureConfigTarget,
  planConfigTarget,
  planConfigTargetRemoval,
  revalidateConfigTargetPlan,
  restoreConfigTargetApplication,
  sensitiveConfigTargetSnapshotBytes,
  verifyConfigTargetApplication,
  verifyConfigTargetPlan,
  type ConfigTargetApplication,
  type ConfigTargetPlan,
} from "./config-target.ts";

const FRESH_TABS_MAX_BYTES = 1_048_576;
const MARKER_TEXT = "Side Glance fresh terminal tabs";
const END_MARKER = `# <<< ${MARKER_TEXT} v1 <<<`;
const JOINERS = {
  empty: "",
  lf: "\n",
  none: "\n\n",
} as const;

type JoinKind = keyof typeof JOINERS;
type ManagedBlockFormat = "bel" | "st";

export type FreshTabsState = "eligible" | "blocked" | "unavailable";
export type FreshTabsAction = "create" | "update" | "remove" | "unchanged";

export interface FreshTabsInspection {
  state: FreshTabsState;
  shell: "zsh" | null;
  integrationStatus: "installed" | "not-installed" | "partial" | "unknown";
  reason?: "unsupported-shell" | "ownership-conflict";
  target?: { path: string; action: "create" | "update" | "unchanged" };
}

export interface FreshTabsPlan {
  shell: "zsh";
  configPath: string;
  enabled: boolean;
  action: FreshTabsAction;
  changed: boolean;
}

export interface FreshTabsApplication extends FreshTabsPlan {
  backupPath?: string;
}

interface FreshTabsOptions {
  homeDirectory: string;
  environment: Readonly<Record<string, string | undefined>>;
  configPath?: string;
}

const planStates = new WeakMap<
  FreshTabsPlan,
  { targetPlan: ConfigTargetPlan }
>();
const applicationStates = new WeakMap<
  FreshTabsApplication,
  { targetApplication: ConfigTargetApplication }
>();

export async function inspectFreshTabs(
  options: FreshTabsOptions,
): Promise<FreshTabsInspection> {
  if (!supportedZsh(options.environment.SHELL)) {
    return {
      state: "unavailable",
      shell: null,
      integrationStatus: "unknown",
      reason: "unsupported-shell",
    };
  }
  const targetPath = freshTabsConfigPath(options);
  const snapshot = await captureConfigTarget(descriptor(options.homeDirectory, targetPath));
  const raw = sensitiveConfigTargetSnapshotBytes(snapshot)?.toString("utf8") ?? "";
  const parsed = parseManagedBlock(raw);
  if (parsed.status === "conflict") {
    return {
      state: "blocked",
      shell: "zsh",
      integrationStatus: "partial",
      reason: "ownership-conflict",
      target: {
        path: targetPath,
        action: snapshot.exists ? "update" : "create",
      },
    };
  }
  return {
    state: "eligible",
    shell: "zsh",
    integrationStatus: parsed.status === "installed" ? "installed" : "not-installed",
    target: {
      path: targetPath,
      action:
        parsed.status === "installed" && parsed.format === "bel"
          ? "unchanged"
          : snapshot.exists
            ? "update"
            : "create",
    },
  };
}

export async function planFreshTabs(
  options: FreshTabsOptions & { enabled: boolean },
): Promise<FreshTabsPlan> {
  if (options.enabled && !supportedZsh(options.environment.SHELL)) {
    throw new Error("Fresh terminal tabs currently require a supported zsh shell.");
  }
  const targetPath = freshTabsConfigPath(options);
  const snapshot = await captureConfigTarget(descriptor(options.homeDirectory, targetPath));
  const raw = sensitiveConfigTargetSnapshotBytes(snapshot)?.toString("utf8") ?? "";
  const parsed = parseManagedBlock(raw);
  if (parsed.status === "conflict") {
    throw new Error(
      "Fresh terminal tab ownership markers are malformed or duplicated; no shell configuration was changed.",
    );
  }

  let targetPlan: ConfigTargetPlan;
  let action: FreshTabsAction;
  if (options.enabled) {
    const desired =
      parsed.status === "installed"
        ? parsed.format === "bel"
          ? raw
          : replaceManagedBlock(raw, parsed.join, parsed.format)
        : appendManagedBlock(raw);
    targetPlan = planConfigTarget(snapshot, desired, { backupExisting: true });
    action = targetPlan.changed
      ? snapshot.exists
        ? "update"
        : "create"
      : "unchanged";
  } else if (parsed.status === "installed") {
    const desired = removeManagedBlock(raw, parsed.join, parsed.format);
    targetPlan =
      desired === null
        ? planConfigTargetRemoval(snapshot, { backupExisting: true })
        : planConfigTarget(snapshot, desired, { backupExisting: true });
    action = targetPlan.changed ? "remove" : "unchanged";
  } else {
    targetPlan = snapshot.exists
      ? planConfigTarget(snapshot, raw, { backupExisting: false })
      : planConfigTargetRemoval(snapshot, { backupExisting: false });
    action = "unchanged";
  }

  const plan = Object.freeze({
    shell: "zsh" as const,
    configPath: targetPath,
    enabled: options.enabled,
    action,
    changed: targetPlan.changed,
  });
  planStates.set(plan, { targetPlan });
  return plan;
}

export async function applyFreshTabsPlan(
  plan: FreshTabsPlan,
): Promise<FreshTabsApplication> {
  const state = requirePlanState(plan);
  const targetApplication = await applyConfigTargetPlan(state.targetPlan);
  const application = Object.freeze({
    ...plan,
    ...(targetApplication.backupPath
      ? { backupPath: targetApplication.backupPath }
      : {}),
  });
  applicationStates.set(application, { targetApplication });
  return application;
}

export async function removeFreshTabs(
  options: FreshTabsOptions,
): Promise<FreshTabsApplication> {
  const plan = await planFreshTabs({ ...options, enabled: false });
  const application = await applyFreshTabsPlan(plan);
  await verifyFreshTabsApplication(application);
  return application;
}

export async function revalidateFreshTabsPlan(plan: FreshTabsPlan): Promise<void> {
  await revalidateConfigTargetPlan(requirePlanState(plan).targetPlan);
}

export async function backupFreshTabsPlan(
  plan: FreshTabsPlan,
): Promise<string | undefined> {
  return await backupConfigTargetPlan(requirePlanState(plan).targetPlan);
}

export async function verifyFreshTabsPlan(plan: FreshTabsPlan): Promise<void> {
  await verifyConfigTargetPlan(requirePlanState(plan).targetPlan);
}

export async function verifyFreshTabsApplication(
  application: FreshTabsApplication,
): Promise<void> {
  await verifyConfigTargetApplication(
    requireApplicationState(application).targetApplication,
  );
}

export async function restoreFreshTabsApplication(
  application: FreshTabsApplication,
): Promise<void> {
  await restoreConfigTargetApplication(
    requireApplicationState(application).targetApplication,
  );
}

function freshTabsConfigPath(options: FreshTabsOptions): string {
  const homeDirectory = path.resolve(options.homeDirectory);
  const targetPath = path.resolve(options.configPath ?? path.join(homeDirectory, ".zshrc"));
  const relative = path.relative(homeDirectory, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Fresh terminal tab configuration must stay inside the home directory.");
  }
  return targetPath;
}

function descriptor(homeDirectory: string, targetPath: string) {
  return {
    rootDirectory: path.resolve(homeDirectory),
    targetPath,
    label: "zsh startup configuration",
    maxBytes: FRESH_TABS_MAX_BYTES,
    defaultMode: 0o600,
  };
}

function supportedZsh(shell: string | undefined): boolean {
  return typeof shell === "string" && path.basename(shell) === "zsh";
}

function appendManagedBlock(raw: string): string {
  const join: JoinKind = raw.length === 0 ? "empty" : raw.endsWith("\n") ? "lf" : "none";
  return `${raw}${JOINERS[join]}${managedBlock(join)}`;
}

function replaceManagedBlock(
  raw: string,
  join: JoinKind,
  format: ManagedBlockFormat,
): string {
  const block = managedBlock(join, format);
  if (!raw.endsWith(block)) {
    throw new Error("Fresh terminal tab ownership markers changed before upgrade.");
  }
  return `${raw.slice(0, -block.length)}${managedBlock(join)}`;
}

function removeManagedBlock(
  raw: string,
  join: JoinKind,
  format: ManagedBlockFormat,
): string | null {
  const block = managedBlock(join, format);
  if (join === "empty") return raw === block ? null : raw;
  const suffix = `${JOINERS[join]}${block}`;
  if (!raw.endsWith(suffix)) {
    throw new Error("Fresh terminal tab ownership markers changed before removal.");
  }
  return raw.slice(0, -suffix.length);
}

function managedBlock(
  join: JoinKind,
  format: ManagedBlockFormat = "bel",
): string {
  const reset = format === "bel" ? "\\e]111\\a" : "\\e]111\\e\\\\";
  return `# >>> ${MARKER_TEXT} v1 (join: ${join}) >>>
if [[ -o interactive && -t 1 && \${SHLVL:-0} -le 1 && -z \${TMUX-} && -z \${SSH_CONNECTION-} && -z \${SSH_TTY-} ]]; then
  builtin printf '${reset}'
fi
${END_MARKER}\n`;
}

function parseManagedBlock(
  raw: string,
):
  | { status: "absent" }
  | { status: "installed"; join: JoinKind; format: ManagedBlockFormat }
  | { status: "conflict" } {
  const hasMarker = raw.includes(MARKER_TEXT);
  for (const join of Object.keys(JOINERS) as JoinKind[]) {
    for (const format of ["bel", "st"] as const) {
      const block = managedBlock(join, format);
      if (join === "empty" && raw === block) {
        return { status: "installed", join, format };
      }
      if (join !== "empty" && raw.endsWith(`${JOINERS[join]}${block}`)) {
        const prefix = raw.slice(0, -(JOINERS[join].length + block.length));
        if (
          join === "lf" &&
          prefix.endsWith("\n") &&
          !prefix.includes(MARKER_TEXT)
        ) {
          return { status: "installed", join, format };
        }
        if (
          join === "none" &&
          prefix.length > 0 &&
          !prefix.endsWith("\n") &&
          !prefix.includes(MARKER_TEXT)
        ) {
          return { status: "installed", join, format };
        }
      }
    }
  }
  return hasMarker ? { status: "conflict" } : { status: "absent" };
}

function requirePlanState(plan: FreshTabsPlan): { targetPlan: ConfigTargetPlan } {
  const state = planStates.get(plan);
  if (!state) throw new Error("Fresh terminal tab plan is not recognized.");
  return state;
}

function requireApplicationState(application: FreshTabsApplication): {
  targetApplication: ConfigTargetApplication;
} {
  const state = applicationStates.get(application);
  if (!state) throw new Error("Fresh terminal tab application is not recognized.");
  return state;
}
