"use client";

import { useState, type CSSProperties } from "react";

import {
  visualForPhase,
  type PlaygroundChannel,
  type PlaygroundPhase,
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

const installCommand = "npm install -g terminal-signal@beta";

export function SignalPlayground() {
  const [phase, setPhase] = useState<PlaygroundPhase>("completed");
  const [channel, setChannel] = useState<PlaygroundChannel>("both");
  const [elapsed, setElapsed] = useState(60);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const visual = visualForPhase(phase, elapsed);
  const style = {
    "--signal-wash": `#${visual.wash}`,
    "--signal-accent": `#${visual.accent}`,
    "--signal-urgency": visual.urgency / 1_000,
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
    <section className="playground" aria-labelledby="playground-title">
      <div className="playground-head">
        <div>
          <span className="playground-kicker">Live state model</span>
          <h2 id="playground-title">Try the signal</h2>
        </div>
        <div className="live-badge">
          <span aria-hidden="true" /> live
        </div>
      </div>

      <div className="phase-controls" aria-label="Choose a lifecycle state">
        {phases.map((item) => (
          <button
            type="button"
            key={item.phase}
            aria-pressed={phase === item.phase}
            onClick={() => setPhase(item.phase)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        className="terminal-demo"
        data-channel={channel}
        data-phase={phase}
        style={style}
      >
        <div className="terminal-bar">
          <div className="window-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span>signal — zsh — 92×28</span>
          <div className="terminal-owner">
            <span aria-hidden="true" /> owned
          </div>
        </div>
        <div className="terminal-body">
          <div className="terminal-line terminal-muted">
            <span>~</span> signal run -- claude
          </div>
          <div className="terminal-line">
            <span className="terminal-prompt">❯</span> Refactor the lifecycle controller
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
            <span className="terminal-cursor" aria-hidden="true" />
          </div>
        </div>
        <div className="tmux-bar">
          <span className="tmux-session">signal</span>
          <span className="tmux-window">
            <i aria-hidden="true" /> 1:controller
          </span>
          <span className="tmux-spacer" />
          <span>{visual.label.toLowerCase()}</span>
        </div>
      </div>

      <div className="playground-status" aria-live="polite" aria-atomic="true">
        <div>
          <span
            className="status-swatch"
            style={{ backgroundColor: `#${visual.accent}` }}
            aria-hidden="true"
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
          type="range"
          min="0"
          max="300"
          step="5"
          value={elapsed}
          onChange={(event) => {
            setElapsed(Number(event.currentTarget.value));
            setPhase("completed");
          }}
        />
        <div className="range-ticks" aria-hidden="true">
          <span>just now</span>
          <span>5 min</span>
        </div>
      </div>

      <div className="playground-foot">
        <div className="channel-controls" aria-label="Choose renderer channels">
          {channels.map((item) => (
            <button
              type="button"
              key={item.channel}
              aria-pressed={channel === item.channel}
              onClick={() => setChannel(item.channel)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button className="copy-button" type="button" onClick={copyInstallCommand}>
          <CopyIcon />
          {copyState === "copied"
            ? "Copied"
            : copyState === "failed"
              ? "Copy failed"
              : "Copy install"}
        </button>
      </div>
    </section>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="5.5" y="5.5" width="7" height="7" rx="1.5" />
      <path d="M3.5 10.5h-.25A1.75 1.75 0 0 1 1.5 8.75v-5.5A1.75 1.75 0 0 1 3.25 1.5h5.5a1.75 1.75 0 0 1 1.75 1.75v.25" />
    </svg>
  );
}
