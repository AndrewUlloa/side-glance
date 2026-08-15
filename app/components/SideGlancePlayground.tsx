"use client";

import { type CSSProperties, useState } from "react";

import {
  type PlaygroundChannel,
  type PlaygroundPhase,
  visualForPhase,
} from "./playground-model";

const phases: Array<{ phase: PlaygroundPhase; label: string }> = [
  { phase: "working", label: "Working" },
  { phase: "waiting", label: "Waiting" },
  { phase: "completed", label: "Ready" },
  { phase: "failed", label: "Failed" },
  { phase: "inactive", label: "Inactive" },
];

const channels: Array<{ channel: PlaygroundChannel; label: string }> = [
  { channel: "terminal", label: "Terminal" },
  { channel: "tmux", label: "tmux" },
  { channel: "both", label: "Both" },
];

const installCommand = "npm install -g side-glance@beta";

export function SideGlancePlayground() {
  const [phase, setPhase] = useState<PlaygroundPhase>("completed");
  const [channel, setChannel] = useState<PlaygroundChannel>("both");
  const [elapsed, setElapsed] = useState(60);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );
  const visual = visualForPhase(phase, elapsed);
  const copyLabel = {
    copied: "Copied",
    failed: "Copy failed",
    idle: "Copy install",
  }[copyState];
  const style = {
    "--side-glance-wash": `#${visual.wash}`,
    "--side-glance-accent": `#${visual.accent}`,
    "--side-glance-urgency": visual.urgency / 1000,
  } as CSSProperties;

  async function copyInstallCommand() {
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <section aria-labelledby="playground-title" className="playground">
      <div className="playground-head">
        <div>
          <span className="playground-kicker">Live state model</span>
          <h2 id="playground-title">Try Side Glance</h2>
        </div>
        <div className="live-badge">
          <span aria-hidden="true" /> live
        </div>
      </div>

      <div
        aria-label="Choose a lifecycle state"
        className="phase-controls"
        role="group"
      >
        {phases.map((item) => (
          <button
            aria-pressed={phase === item.phase}
            key={item.phase}
            onClick={() => setPhase(item.phase)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        className="terminal-demo"
        data-channel={channel}
        data-motion-surface
        data-phase={phase}
        style={style}
      >
        <div className="terminal-bar">
          <div aria-hidden="true" className="window-dots">
            <span />
            <span />
            <span />
          </div>
          <span>side-glance — zsh — 92×28</span>
          <div className="terminal-owner">
            <span aria-hidden="true" /> owned
          </div>
        </div>
        <div className="terminal-body">
          <div className="terminal-line terminal-muted">
            <span>~</span> side-glance run -- claude
          </div>
          <div className="terminal-line">
            <span className="terminal-prompt">❯</span> Refactor the lifecycle
            controller
          </div>
          <div className="terminal-log">
            <span className="terminal-tree">├─</span>
            <span>normalized provider event</span>
            <em>12ms</em>
          </div>
          <div className="terminal-log">
            <span className="terminal-tree">├─</span>
            <span>lease generation checked</span>
            <em>pass</em>
          </div>
          <div className="terminal-log terminal-log-active">
            <span className="terminal-tree">└─</span>
            <span>{visual.message}</span>
          </div>
          <div className="terminal-cursor-line">
            <span className="terminal-prompt">❯</span>
            <span aria-hidden="true" className="terminal-cursor" />
          </div>
        </div>
        <div className="tmux-bar">
          <span className="tmux-session">side-glance</span>
          <span className="tmux-window">
            <i aria-hidden="true" /> 1:controller
          </span>
          <span className="tmux-spacer" />
          <span>{visual.label.toLowerCase()}</span>
        </div>
      </div>

      <div aria-atomic="true" aria-live="polite" className="playground-status">
        <div>
          <span
            aria-hidden="true"
            className="status-swatch"
            style={{ backgroundColor: `#${visual.accent}` }}
          />
          <strong>{visual.label}</strong>
          <span>{visual.urgency / 10}% heat</span>
        </div>
        <code>#{visual.wash}</code>
      </div>

      <div className="range-control">
        <div className="range-label">
          <label htmlFor="elapsed-range">Ready for</label>
          <output htmlFor="elapsed-range">{elapsed}s</output>
        </div>
        <input
          id="elapsed-range"
          max="300"
          min="0"
          onChange={(event) => {
            setElapsed(Number(event.currentTarget.value));
            setPhase("completed");
          }}
          step="5"
          type="range"
          value={elapsed}
        />
        <div aria-hidden="true" className="range-ticks">
          <span>just now</span>
          <span>5 min</span>
        </div>
      </div>

      <div className="playground-foot">
        <div
          aria-label="Choose renderer channels"
          className="channel-controls"
          role="group"
        >
          {channels.map((item) => (
            <button
              aria-pressed={channel === item.channel}
              key={item.channel}
              onClick={() => setChannel(item.channel)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          className="copy-button"
          onClick={copyInstallCommand}
          type="button"
        >
          <CopyIcon />
          {copyLabel}
        </button>
      </div>
    </section>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16">
      <rect height="7" rx="1.5" width="7" x="5.5" y="5.5" />
      <path d="M3.5 10.5h-.25A1.75 1.75 0 0 1 1.5 8.75v-5.5A1.75 1.75 0 0 1 3.25 1.5h5.5a1.75 1.75 0 0 1 1.75 1.75v.25" />
    </svg>
  );
}
