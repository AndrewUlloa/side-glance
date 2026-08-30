"use client";

import { motion, useReducedMotion } from "motion/react";
import { type CSSProperties, useEffect, useState } from "react";

import { trackDemoEngaged } from "../lib/analytics-events";
import {
  InteractiveClaudeTerminal,
  type TerminalScenario,
} from "./InteractiveClaudeTerminal";
import {
  type PlaygroundAppearance,
  type PlaygroundPhase,
  visualForPhase,
} from "./playground-model";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 * Read top-to-bottom. Each value is ms after page reveal.
 *
 *    0ms   terminal enters; long-loop Ready ring remains parked
 * 2500ms   terminal settles; long-loop Ready ring fills 0 → 1
 * 6500ms   ring completes; next terminal state activates
 * 4000ms   each following ring fills before advancing again
 * manual   a pointer or keyboard choice pauses playback on that state
 * ───────────────────────────────────────────────────────── */

const MILLISECONDS_PER_SECOND = 1000;
const PAGE_REVEAL_EVENT = "side-glance:loading-complete";

const TIMING = {
  startPlayback: 2500, // wait for the terminal entrance to settle
  advanceState: 4000, // fill one ring, then advance the terminal
} as const;

const PROGRESS_RING = {
  center: 12, // SVG center point
  radius: 9, // ring radius inside the 24px icon
  strokeWidth: 2, // visible ring weight
  viewBox: "0 0 24 24", // matches the lifecycle icon token
  transition: {
    duration: TIMING.advanceState / MILLISECONDS_PER_SECOND,
    ease: "linear" as const,
  },
  resetTransition: { duration: 0 },
} as const;

const STORYBOARD_STAGE = {
  waiting: -1, // page or terminal entrance is still in progress
} as const;

const INITIAL_STATE_INDEX = 3;

const LIFECYCLE_STATES: ReadonlyArray<{
  id: string;
  label: string;
  phase: PlaygroundPhase;
  elapsedSeconds: number;
  scenario: TerminalScenario;
  terminalId: string;
}> = [
  {
    id: "working",
    label: "Working",
    phase: "working",
    elapsedSeconds: 108,
    scenario: "working",
    terminalId: "tmux_01",
  },
  {
    id: "waiting",
    label: "Waiting",
    phase: "waiting",
    elapsedSeconds: 134,
    scenario: "waiting",
    terminalId: "tmux_02",
  },
  {
    id: "ready-short",
    label: "Ready · short",
    phase: "completed",
    elapsedSeconds: 18,
    scenario: "ready-short",
    terminalId: "tmux_03",
  },
  {
    id: "ready-long",
    label: "Ready · long",
    phase: "completed",
    elapsedSeconds: 1122,
    scenario: "ready-long",
    terminalId: "tmux_04",
  },
  {
    id: "failed",
    label: "Failed",
    phase: "failed",
    elapsedSeconds: 372,
    scenario: "failed",
    terminalId: "tmux_05",
  },
];

export function TerminalShowcase() {
  const [stage, setStage] = useState<number>(STORYBOARD_STAGE.waiting);
  const [isPlaybackPaused, setPlaybackPaused] = useState(false);
  const [appearance, setAppearance] = useState<PlaygroundAppearance>("status");
  const shouldReduceMotion = useReducedMotion();
  const activeStateIndex =
    stage === STORYBOARD_STAGE.waiting
      ? INITIAL_STATE_INDEX
      : stage % LIFECYCLE_STATES.length;
  const activeState = LIFECYCLE_STATES[activeStateIndex];
  const { phase } = activeState;
  const isPlaybackRunning =
    stage !== STORYBOARD_STAGE.waiting &&
    !isPlaybackPaused &&
    !shouldReduceMotion;

  useEffect(() => {
    if (shouldReduceMotion || isPlaybackPaused) {
      return;
    }

    let startTimer: ReturnType<typeof setTimeout> | undefined;
    const startPlayback = () => {
      if (startTimer) {
        clearTimeout(startTimer);
      }
      startTimer = setTimeout(
        () => setStage(INITIAL_STATE_INDEX),
        TIMING.startPlayback
      );
    };
    const { pageMotion } = document.documentElement.dataset;

    if (pageMotion === "ready" || pageMotion === "settled") {
      startPlayback();
    } else {
      window.addEventListener(PAGE_REVEAL_EVENT, startPlayback, { once: true });
    }

    return () => {
      if (startTimer) {
        clearTimeout(startTimer);
      }
      window.removeEventListener(PAGE_REVEAL_EVENT, startPlayback);
    };
  }, [isPlaybackPaused, shouldReduceMotion]);

  useEffect(() => {
    if (
      stage === STORYBOARD_STAGE.waiting ||
      isPlaybackPaused ||
      shouldReduceMotion
    ) {
      return;
    }

    const advanceTimer = setTimeout(
      () => setStage((currentStage) => currentStage + 1),
      TIMING.advanceState
    );

    return () => clearTimeout(advanceTimer);
  }, [isPlaybackPaused, shouldReduceMotion, stage]);

  const selectState = (index: number) => {
    trackDemoEngaged("lifecycle");
    setPlaybackPaused(true);
    setStage(index);
  };

  const selectAppearance = (nextAppearance: PlaygroundAppearance) => {
    trackDemoEngaged("color_model");
    setAppearance(nextAppearance);
  };

  return (
    <figure className="minimal-terminal-showcase gap-showcase">
      <div className="minimal-terminal-surface rounded-terminal-stage px-terminal-stage-x py-terminal-stage-y">
        <InteractiveClaudeTerminal
          appearance={appearance}
          elapsedSeconds={activeState.elapsedSeconds}
          phase={phase}
          scenario={activeState.scenario}
          terminalId={activeState.terminalId}
        />
      </div>

      <figcaption>
        <div className="minimal-lifecycle-controls">
          <fieldset
            aria-label="Choose a Side Glance color model"
            className="minimal-theme-picker"
          >
            <legend className="minimal-theme-toggle-label">Color model</legend>
            <div className="minimal-theme-toggle">
              <button
                aria-pressed={appearance === "status"}
                className="minimal-theme-toggle-button"
                onClick={() => selectAppearance("status")}
                type="button"
              >
                Status
              </button>
              <button
                aria-pressed={appearance === "heat"}
                className="minimal-theme-toggle-button"
                onClick={() => selectAppearance("heat")}
                type="button"
              >
                Heat
              </button>
            </div>
          </fieldset>

          <ul
            aria-label="Choose a Side Glance terminal moment"
            className="minimal-lifecycle gap-lifecycle-gap"
          >
            {LIFECYCLE_STATES.map((state, index) => {
              const visual = visualForPhase(
                state.phase,
                state.elapsedSeconds,
                appearance
              );
              const isActive = activeState.id === state.id;
              const buttonStyle = {
                "--lifecycle-accent": `#${visual.accent}`,
              } as CSSProperties;

              return (
                <li className="minimal-lifecycle-state" key={state.id}>
                  <button
                    aria-controls="side-glance-terminal"
                    aria-pressed={activeState.id === state.id}
                    className="minimal-lifecycle-button gap-lifecycle-state rounded-lifecycle px-lifecycle-x py-lifecycle-y text-lifecycle"
                    data-state={state.id}
                    onClick={() => selectState(index)}
                    style={buttonStyle}
                    type="button"
                  >
                    <LifecycleProgressRing
                      isActive={isActive}
                      isPlaying={isActive && isPlaybackRunning}
                      key={isActive ? stage : state.id}
                    />
                    <span>{state.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <p aria-live="polite" className="minimal-lifecycle-explanation">
          {appearance === "status" ? (
            <>Ready stays green at every duration. Red means failure.</>
          ) : (
            <>
              Successful Ready turns warm with duration; under 10s stays quiet.
              This preview uses a 5m ceiling; Side Glance adapts it from recent
              local turns. Failure is red immediately.
            </>
          )}
        </p>

        <span
          aria-live={isPlaybackRunning ? "off" : "polite"}
          className="sr-only"
        >
          Showing the {activeState.label} terminal moment.
        </span>
      </figcaption>
    </figure>
  );
}

function LifecycleProgressRing({
  isActive,
  isPlaying,
}: {
  isActive: boolean;
  isPlaying: boolean;
}) {
  const pathLength = isActive ? 1 : 0;

  return (
    <svg
      aria-hidden="true"
      className="minimal-lifecycle-progress size-lifecycle-icon"
      focusable="false"
      viewBox={PROGRESS_RING.viewBox}
    >
      <circle
        className="minimal-lifecycle-progress-track"
        cx={PROGRESS_RING.center}
        cy={PROGRESS_RING.center}
        r={PROGRESS_RING.radius}
        strokeWidth={PROGRESS_RING.strokeWidth}
      />
      <motion.circle
        animate={{ pathLength }}
        className="minimal-lifecycle-progress-value"
        cx={PROGRESS_RING.center}
        cy={PROGRESS_RING.center}
        initial={{ pathLength: isPlaying ? 0 : pathLength }}
        r={PROGRESS_RING.radius}
        strokeWidth={PROGRESS_RING.strokeWidth}
        transition={
          isPlaying ? PROGRESS_RING.transition : PROGRESS_RING.resetTransition
        }
      />
    </svg>
  );
}
