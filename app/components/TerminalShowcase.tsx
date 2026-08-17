"use client";

import Image from "next/image";
import { type CSSProperties, useState } from "react";

import { InteractiveClaudeTerminal } from "./InteractiveClaudeTerminal";
import { type PlaygroundPhase, visualForPhase } from "./playground-model";

const LIFECYCLE_STATES: ReadonlyArray<{
  id: string;
  label: string;
  phase: PlaygroundPhase;
}> = [
  { id: "working", label: "Working", phase: "working" },
  { id: "waiting", label: "Waiting", phase: "waiting" },
  { id: "ready", label: "Ready", phase: "completed" },
  { id: "failed", label: "Failed", phase: "failed" },
  { id: "inactive", label: "Inactive", phase: "inactive" },
];

export function TerminalShowcase() {
  const [phase, setPhase] = useState<PlaygroundPhase>("failed");
  const selectedState = visualForPhase(phase, 60);

  return (
    <figure className="minimal-terminal-showcase gap-showcase">
      <div className="minimal-terminal-surface rounded-terminal-stage px-terminal-stage-x py-terminal-stage-y">
        <InteractiveClaudeTerminal phase={phase} />
      </div>

      <figcaption>
        <ul
          aria-label="Choose a Side Glance agent lifecycle state"
          className="minimal-lifecycle gap-lifecycle-gap"
        >
          {LIFECYCLE_STATES.map((state) => {
            const visual = visualForPhase(state.phase, 60);
            const buttonStyle = {
              "--lifecycle-accent": `#${visual.accent}`,
            } as CSSProperties;

            return (
              <li className="minimal-lifecycle-state" key={state.id}>
                <button
                  aria-controls="side-glance-terminal"
                  aria-pressed={phase === state.phase}
                  className="minimal-lifecycle-button gap-lifecycle-state rounded-lifecycle px-lifecycle-x py-lifecycle-y text-lifecycle"
                  data-state={state.id}
                  onClick={() => setPhase(state.phase)}
                  style={buttonStyle}
                  type="button"
                >
                  <Image
                    alt=""
                    aria-hidden="true"
                    className="size-lifecycle-icon"
                    height={24}
                    src="/install-icon.svg"
                    width={24}
                  />
                  <span>{state.label}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <span aria-live="polite" className="sr-only">
          Showing the {selectedState.label} lifecycle state.
        </span>
      </figcaption>
    </figure>
  );
}
