"use client";

import { motion, useReducedMotion } from "motion/react";
import { type CSSProperties, useEffect, useState } from "react";
import { DEFAULT_SIDE_GLANCE_THEME } from "../../src/core/theme";
import { LINEAR_MOTION } from "../lib/motion-tokens";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after mount/replay.
 *
 *    0ms   four quiet sessions hold in a 2×2 workspace
 *  400ms   Working wakes in cyan
 *  500ms   Ready wakes in green
 *  600ms   Waiting wakes in amber
 *  850ms   Failed wakes in red
 * 1300ms   grid → cool-to-urgent layered stack
 * 2800ms   replay control appears after the stack settles
 * ───────────────────────────────────────────────────────── */

const TIMING = {
  gridStart: 0, // reset to the quiet four-window grid
  workingWake: LINEAR_MOTION.lineOneDelay * 1000,
  readyWake: LINEAR_MOTION.lineTwoDelay * 1000,
  waitingWake: LINEAR_MOTION.descriptionDelay * 1000,
  failedWake: LINEAR_MOTION.announcementDelay * 1000,
  stackResolve: LINEAR_MOTION.illustrationDelay * 1000,
  replayReady:
    (LINEAR_MOTION.illustrationDelay + LINEAR_MOTION.illustrationDuration) *
    1000,
} as const;

const STAGE = {
  grid: 0,
  working: 1,
  ready: 2,
  waiting: 3,
  failed: 4,
  stack: 5,
  complete: 6,
} as const;

type StoryboardStage = (typeof STAGE)[keyof typeof STAGE];

const PHASE_COLORS = {
  working: {
    accent: `#${DEFAULT_SIDE_GLANCE_THEME.workingAccent}`,
    wash: `#${DEFAULT_SIDE_GLANCE_THEME.workingWash}`,
    border: "rgba(0, 157, 137, 0.52)",
  },
  ready: {
    accent: `#${DEFAULT_SIDE_GLANCE_THEME.tmuxStops[1]}`,
    wash: `#${DEFAULT_SIDE_GLANCE_THEME.washStops[1]}`,
    border: "rgba(63, 168, 78, 0.5)",
  },
  waiting: {
    accent: `#${DEFAULT_SIDE_GLANCE_THEME.waitingAccent}`,
    wash: `#${DEFAULT_SIDE_GLANCE_THEME.waitingWash}`,
    border: "rgba(240, 167, 38, 0.54)",
  },
  failed: {
    accent: `#${DEFAULT_SIDE_GLANCE_THEME.tmuxStops[6]}`,
    wash: `#${DEFAULT_SIDE_GLANCE_THEME.washStops[6]}`,
    border: "rgba(243, 53, 51, 0.58)",
  },
} as const;

const TERMINALS = [
  {
    id: "working",
    phase: "working",
    title: "controller — claude",
    state: "Working",
    ...PHASE_COLORS.working,
    wakeStage: STAGE.working,
    command: "side-glance run -- claude",
    activity: "reconciling lease generation",
    detail: "streaming · 18s",
  },
  {
    id: "ready",
    phase: "completed",
    title: "release — codex",
    state: "Ready",
    ...PHASE_COLORS.ready,
    wakeStage: STAGE.ready,
    command: "side-glance run -- codex",
    activity: "turn complete — review ready",
    detail: "finished · 4s",
  },
  {
    id: "waiting",
    phase: "waiting",
    title: "docs — gemini",
    state: "Waiting",
    ...PHASE_COLORS.waiting,
    wakeStage: STAGE.waiting,
    command: "side-glance run -- gemini",
    activity: "permission required",
    detail: "waiting · 42s",
  },
  {
    id: "failed",
    phase: "failed",
    title: "deploy — aider",
    state: "Failed",
    ...PHASE_COLORS.failed,
    wakeStage: STAGE.failed,
    command: "side-glance run -- aider",
    activity: "process exited with code 1",
    detail: "failed · now",
  },
] as const;

const GRID = {
  positions: [
    { left: "0%", top: "0%" },
    { left: "51%", top: "0%" },
    { left: "0%", top: "52%" },
    { left: "51%", top: "52%" },
  ],
  width: "49%",
  height: "48%",
} as const;

const STACK = {
  positions: [
    { left: "4%", top: "4%", scale: 0.94, zIndex: 1 },
    { left: "7%", top: "11%", scale: 0.96, zIndex: 2 },
    { left: "10%", top: "18%", scale: 0.98, zIndex: 3 },
    { left: "13%", top: "25%", scale: 1, zIndex: 4 },
  ],
  width: "82%",
  height: "68%",
} as const;

const WINDOW = {
  sleepingWash: "#141516",
  sleepingBorder: "#ffffff14",
  sleepingOpacity: 0.68,
  awakeOpacity: 1,
  sleepingFilter: "saturate(0.28) brightness(0.72)",
  awakeFilter: "saturate(1) brightness(1)",
  transition: {
    type: "tween" as const,
    duration: LINEAR_MOTION.illustrationDuration,
    ease: LINEAR_MOTION.illustrationEase,
  },
  instant: { duration: 0 },
} as const;

const REPLAY = {
  hiddenOpacity: 0,
  visibleOpacity: 1,
  hiddenY: 8,
  visibleY: 0,
  transition: {
    type: "tween" as const,
    duration: LINEAR_MOTION.interactionDuration,
    ease: LINEAR_MOTION.interactionEase,
  },
} as const;

export function TerminalStoryboard() {
  const shouldReduceMotion = useReducedMotion();
  const [stage, setStage] = useState<StoryboardStage>(STAGE.grid);
  const [replayTrigger, setReplayTrigger] = useState(0);
  const [hasHydrated, setHasHydrated] = useState(false);
  const visibleStage =
    shouldReduceMotion && hasHydrated ? STAGE.complete : stage;
  const isStacked = visibleStage >= STAGE.stack;
  const isComplete = visibleStage >= STAGE.complete;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setHasHydrated(true), TIMING.gridStart));

    const shouldSkipInitialSequence =
      replayTrigger === 0 &&
      document.documentElement.dataset.heroMotion !== "ready";

    if (shouldReduceMotion || shouldSkipInitialSequence) {
      timers.push(setTimeout(() => setStage(STAGE.complete), TIMING.gridStart));
      return () => timers.forEach(clearTimeout);
    }

    const schedule = (nextStage: StoryboardStage, at: number) => {
      timers.push(setTimeout(() => setStage(nextStage), at));
    };

    schedule(STAGE.grid, TIMING.gridStart);
    schedule(STAGE.working, TIMING.workingWake);
    schedule(STAGE.ready, TIMING.readyWake);
    schedule(STAGE.waiting, TIMING.waitingWake);
    schedule(STAGE.failed, TIMING.failedWake);
    schedule(STAGE.stack, TIMING.stackResolve);
    schedule(STAGE.complete, TIMING.replayReady);

    return () => timers.forEach(clearTimeout);
  }, [replayTrigger, shouldReduceMotion]);

  const replay = () => {
    setStage(STAGE.grid);
    setReplayTrigger((value) => value + 1);
  };

  return (
    <section
      aria-labelledby="terminal-story-title"
      className="terminal-storyboard"
      data-layout={isStacked ? "stack" : "grid"}
    >
      <div className="storyboard-head">
        <div>
          <span className="playground-kicker">
            Four sessions · one clear glance
          </span>
          <h2 id="terminal-story-title">Know which terminal needs you.</h2>
        </div>
        <motion.button
          animate={{
            opacity:
              isComplete && !shouldReduceMotion
                ? REPLAY.visibleOpacity
                : REPLAY.hiddenOpacity,
            y: isComplete ? REPLAY.visibleY : REPLAY.hiddenY,
          }}
          aria-label="Replay the four-terminal sequence"
          className="storyboard-replay"
          disabled={!isComplete || shouldReduceMotion === true}
          initial={false}
          onClick={replay}
          tabIndex={isComplete && !shouldReduceMotion ? 0 : -1}
          transition={shouldReduceMotion ? WINDOW.instant : REPLAY.transition}
          type="button"
        >
          <span aria-hidden="true">↻</span> Replay
        </motion.button>
      </div>

      <div aria-live="polite" className="storyboard-stage">
        {TERMINALS.map((terminal, index) => {
          const gridPosition = GRID.positions[index];
          const stackPosition = STACK.positions[index];
          const isAwake = visibleStage >= terminal.wakeStage;
          const style = {
            "--story-accent": terminal.accent,
          } as CSSProperties;

          return (
            <motion.article
              animate={{
                left: isStacked ? stackPosition.left : gridPosition.left,
                top: isStacked ? stackPosition.top : gridPosition.top,
                width: isStacked ? STACK.width : GRID.width,
                height: isStacked ? STACK.height : GRID.height,
                scale: isStacked ? stackPosition.scale : 1,
                zIndex: isStacked ? stackPosition.zIndex : 1,
                opacity: isAwake ? WINDOW.awakeOpacity : WINDOW.sleepingOpacity,
                filter: isAwake ? WINDOW.awakeFilter : WINDOW.sleepingFilter,
                backgroundColor: isAwake ? terminal.wash : WINDOW.sleepingWash,
                borderColor: isAwake ? terminal.border : WINDOW.sleepingBorder,
              }}
              className="story-terminal"
              data-awake={isAwake}
              data-phase={terminal.phase}
              initial={false}
              key={terminal.id}
              style={style}
              transition={
                shouldReduceMotion ? WINDOW.instant : WINDOW.transition
              }
            >
              <div className="story-terminal-bar">
                <div aria-hidden="true" className="story-window-dots">
                  <span />
                  <span />
                  <span />
                </div>
                <span className="story-terminal-title">{terminal.title}</span>
                <span className="story-terminal-state">
                  <i aria-hidden="true" /> {terminal.state}
                </span>
              </div>
              <div className="story-terminal-body">
                <p className="story-command">
                  <span>❯</span> {terminal.command}
                </p>
                <p>
                  <span className="story-tree">├─</span> lifecycle event
                  normalized
                </p>
                <p className="story-active">
                  <span className="story-tree">└─</span> {terminal.activity}
                </p>
                <p className="story-prompt">
                  <span>❯</span>
                  <i aria-hidden="true" />
                </p>
              </div>
              <div className="story-tmux-bar">
                <strong>side-glance</strong>
                <span>{terminal.id}:agent</span>
                <em>{terminal.detail}</em>
              </div>
            </motion.article>
          );
        })}
      </div>

      <div
        aria-label="Lifecycle color order"
        className="storyboard-legend"
        role="group"
      >
        {TERMINALS.map((terminal) => (
          <span key={terminal.id}>
            <i
              aria-hidden="true"
              style={{ backgroundColor: terminal.accent }}
            />
            {terminal.state}
          </span>
        ))}
        <strong>
          {isStacked ? "ordered by attention" : "four sessions active"}
        </strong>
      </div>
    </section>
  );
}
