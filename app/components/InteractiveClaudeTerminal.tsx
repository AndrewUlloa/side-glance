"use client";

import type {
  ChangeEvent,
  CSSProperties,
  FormEvent,
  KeyboardEvent,
} from "react";
import { useEffect, useRef, useState } from "react";

import { type PlaygroundPhase, visualForPhase } from "./playground-model";

const INPUT_MAX_LENGTH = 120;

const INITIAL_ACTIONS = [
  ["Read", "app/auth/callback.ts"],
  ["Update", "app/auth/callback.ts"],
  ["Bash", "npm test -- auth-callback"],
] as const;

const SLASH_COMMANDS = [
  { command: "/model", description: "switch models", id: "model" },
  { command: "/reset", description: "replay demo", id: "reset" },
] as const;

const MODEL_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "grok-4-6", label: "Grok 4.6" },
  { id: "opus-5", label: "Opus 5" },
  { id: "gpt-5-6-sol", label: "GPT-5.6 Sol High Fast" },
  { id: "fable-5", label: "Fable 5 Max" },
  { id: "gemini-3-1-pro", label: "Gemini 3.1 Pro" },
  { id: "composer-2-5", label: "Composer 2.5" },
] as const;

const DEFAULT_MODEL = "Opus 5";
const DEFAULT_MODEL_CONTEXT_LABEL = "Opus 5 (1M context)";
const COMMAND_MENU_ID = "claude-demo-command-menu";

type MenuMode = "commands" | "models";
type SlashCommand = (typeof SLASH_COMMANDS)[number];
type ModelOption = (typeof MODEL_OPTIONS)[number];

interface SlashCommandMenuProps {
  activeItemIndex: number;
  commands: readonly SlashCommand[];
  menuMode: MenuMode;
  models: readonly ModelOption[];
  onActiveItemChange: (index: number) => void;
  onCommandSelect: (command: SlashCommand) => void;
  onModelSelect: (model: ModelOption) => void;
  selectedModel: string;
}

function SlashCommandMenu({
  activeItemIndex,
  commands,
  menuMode,
  models,
  onActiveItemChange,
  onCommandSelect,
  onModelSelect,
  selectedModel,
}: SlashCommandMenuProps) {
  return (
    <div
      aria-label={
        menuMode === "models"
          ? "Available demo models"
          : "Available slash commands"
      }
      className="mock-claude-command-menu"
      id={COMMAND_MENU_ID}
      role="listbox"
    >
      {menuMode === "commands"
        ? commands.map((command, index) => {
            const isActive = index === activeItemIndex;
            return (
              <button
                aria-selected={isActive}
                className={isActive ? "is-active" : undefined}
                id={`${COMMAND_MENU_ID}-commands-${command.id}`}
                key={command.id}
                onClick={() => onCommandSelect(command)}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => onActiveItemChange(index)}
                role="option"
                type="button"
              >
                <span aria-hidden="true" className="mock-menu-arrow">
                  {isActive ? "→" : ""}
                </span>
                <strong>{command.command}</strong>
                <span>{command.description}</span>
              </button>
            );
          })
        : models.map((model, index) => {
            const isActive = index === activeItemIndex;
            return (
              <button
                aria-selected={isActive}
                className={isActive ? "is-active" : undefined}
                id={`${COMMAND_MENU_ID}-models-${model.id}`}
                key={model.id}
                onClick={() => onModelSelect(model)}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => onActiveItemChange(index)}
                role="option"
                type="button"
              >
                <span aria-hidden="true" className="mock-menu-arrow">
                  {isActive ? "→" : ""}
                </span>
                <strong>/model {model.label}</strong>
                {model.label === selectedModel ? (
                  <span aria-hidden="true" title="Selected model">
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
    </div>
  );
}

interface SlashMenuKeyDownOptions {
  canRecallPrompt: boolean;
  event: KeyboardEvent<HTMLInputElement>;
  isMenuOpen: boolean;
  onDismiss: () => void;
  onMove: (distance: number) => void;
  onRecallPrompt: () => void;
  onSelect: () => void;
}

function handleSlashMenuKeyDown({
  canRecallPrompt,
  event,
  isMenuOpen,
  onDismiss,
  onMove,
  onRecallPrompt,
  onSelect,
}: SlashMenuKeyDownOptions) {
  if (isMenuOpen && event.key === "ArrowDown") {
    event.preventDefault();
    onMove(1);
    return;
  }
  if (isMenuOpen && event.key === "ArrowUp") {
    event.preventDefault();
    onMove(-1);
    return;
  }
  if (isMenuOpen && event.key === "Enter") {
    event.preventDefault();
    onSelect();
    return;
  }
  if (isMenuOpen && event.key === "Escape") {
    event.preventDefault();
    onDismiss();
    return;
  }
  if (event.key === "ArrowUp" && canRecallPrompt) {
    event.preventDefault();
    onRecallPrompt();
  }
}

interface SlashMenuControllerOptions {
  draft: string;
  onResetDemo: () => void;
  setDraft: (draft: string) => void;
  submittedPrompt: string;
}

function useSlashCommandMenu({
  draft,
  onResetDemo,
  setDraft,
  submittedPrompt,
}: SlashMenuControllerOptions) {
  const [menuMode, setMenuMode] = useState<MenuMode>("commands");
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [isMenuDismissed, setIsMenuDismissed] = useState(false);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [interactionAnnouncement, setInteractionAnnouncement] = useState("");
  const commandQuery = draft.toLowerCase();
  const modelQuery = draft.startsWith("/model ")
    ? draft.slice("/model ".length).trimStart().toLowerCase()
    : "";
  const filteredCommands = SLASH_COMMANDS.filter(({ command }) =>
    command.toLowerCase().startsWith(commandQuery)
  );
  const filteredModels = MODEL_OPTIONS.filter(({ label }) =>
    label.toLowerCase().includes(modelQuery)
  );
  const visibleItems =
    menuMode === "models" ? filteredModels : filteredCommands;
  const isMenuOpen =
    !isMenuDismissed && draft.startsWith("/") && visibleItems.length > 0;
  const activeItem = visibleItems[activeItemIndex] ?? visibleItems[0];
  const activeDescendant =
    isMenuOpen && activeItem
      ? `${COMMAND_MENU_ID}-${menuMode}-${activeItem.id}`
      : undefined;

  const closeMenu = (announcement: string) => {
    setMenuMode("commands");
    setActiveItemIndex(0);
    setIsMenuDismissed(false);
    setInteractionAnnouncement(announcement);
  };

  const selectCommand = (command: SlashCommand) => {
    if (command.id === "model") {
      setDraft("/model ");
      setMenuMode("models");
      setActiveItemIndex(0);
      setIsMenuDismissed(false);
      setInteractionAnnouncement("Choose a model for the local demo.");
      return;
    }

    setDraft("");
    onResetDemo();
    closeMenu("The local terminal demo was reset.");
  };

  const selectModel = (model: ModelOption) => {
    setSelectedModel(model.label);
    setDraft("");
    closeMenu(`${model.label} selected for the local demo.`);
  };

  const selectActiveItem = () => {
    if (!activeItem) {
      return;
    }
    if (menuMode === "models") {
      selectModel(activeItem as ModelOption);
      return;
    }
    selectCommand(activeItem as SlashCommand);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextDraft = event.target.value;
    setDraft(nextDraft);
    setMenuMode(nextDraft.startsWith("/model ") ? "models" : "commands");
    setActiveItemIndex(0);
    setIsMenuDismissed(false);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    handleSlashMenuKeyDown({
      canRecallPrompt: draft.length === 0 && Boolean(submittedPrompt),
      event,
      isMenuOpen,
      onDismiss: () => {
        setIsMenuDismissed(true);
        setInteractionAnnouncement("Command menu closed.");
      },
      onMove: (distance) =>
        setActiveItemIndex(
          (current) =>
            (current + distance + visibleItems.length) % visibleItems.length
        ),
      onRecallPrompt: () => setDraft(submittedPrompt),
      onSelect: selectActiveItem,
    });
  };

  return {
    activeDescendant,
    activeItemIndex,
    closeMenu,
    filteredCommands,
    filteredModels,
    handleInputChange,
    handleInputKeyDown,
    interactionAnnouncement,
    isMenuOpen,
    menuMode,
    selectActiveItem,
    selectCommand,
    selectModel,
    selectedModel,
    setActiveItemIndex,
    setInteractionAnnouncement,
  };
}

function getInteractionAnnouncement(
  interactionAnnouncement: string,
  submittedPrompt: string
) {
  if (interactionAnnouncement) {
    return interactionAnnouncement;
  }
  if (submittedPrompt) {
    return "To try Side Glance, install the public beta.";
  }
  return "The example session needs judgment.";
}

interface InteractiveClaudeTerminalProps {
  phase?: PlaygroundPhase;
}

export function InteractiveClaudeTerminal({
  phase = "failed",
}: InteractiveClaudeTerminalProps) {
  const [draft, setDraft] = useState("");
  const [submittedPrompt, setSubmittedPrompt] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);
  const resetDemo = () => {
    setSubmittedPrompt("");
  };
  const {
    activeDescendant,
    activeItemIndex,
    closeMenu,
    filteredCommands,
    filteredModels,
    handleInputChange,
    handleInputKeyDown,
    interactionAnnouncement,
    isMenuOpen,
    menuMode,
    selectActiveItem,
    selectCommand,
    selectModel,
    selectedModel,
    setActiveItemIndex,
    setInteractionAnnouncement,
  } = useSlashCommandMenu({
    draft,
    onResetDemo: resetDemo,
    setDraft,
    submittedPrompt,
  });

  useEffect(() => {
    if (!submittedPrompt) {
      return;
    }
    const transcript = transcriptRef.current;
    transcript?.scrollTo({ behavior: "auto", top: transcript.scrollHeight });
  }, [submittedPrompt]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isMenuOpen) {
      selectActiveItem();
      return;
    }

    const prompt = draft.trim();
    if (!prompt) {
      return;
    }
    if (prompt.startsWith("/")) {
      setInteractionAnnouncement(
        "That command is not available in this local demo. Type slash to see commands."
      );
      return;
    }

    setSubmittedPrompt(prompt);
    setDraft("");
    closeMenu("Install Side Glance to try it in your terminal.");
  };

  const visual = visualForPhase(phase, 60);
  const terminalStyle = {
    "--terminal-current-accent": `#${visual.accent}`,
    "--terminal-current-wash": `#${visual.wash}`,
  } as CSSProperties;
  const announcement = getInteractionAnnouncement(
    interactionAnnouncement,
    submittedPrompt
  );
  const selectedModelLabel =
    selectedModel === DEFAULT_MODEL
      ? DEFAULT_MODEL_CONTEXT_LABEL
      : selectedModel;

  return (
    <section
      aria-label={`Interactive Claude session showing the ${visual.label} Side Glance state`}
      className="mock-terminal"
      data-phase={phase}
      id="side-glance-terminal"
      style={terminalStyle}
    >
      <header className="mock-terminal-bar">
        <div aria-hidden="true" className="mock-window-dots">
          <span />
          <span />
          <span />
        </div>
        <span className="mock-terminal-title">
          <i aria-hidden="true" className="mock-folder" />
          andrew — claude — 102×27
        </span>
      </header>

      <div className="mock-terminal-screen">
        <div aria-hidden="true" className="mock-terminal-wash" />

        <section
          aria-label="Sample agent conversation"
          className="mock-terminal-body"
        >
          <div className="mock-claude-transcript" ref={transcriptRef}>
            <div className="mock-claude-brand">
              <span aria-hidden="true">✻</span>
              <p>
                <strong>Claude Code</strong>
                <small>{selectedModelLabel} · ~/code/side-glance</small>
              </p>
            </div>

            <p className="mock-claude-prompt">
              <span aria-hidden="true">❯</span>
              <span>Update the auth callback and run the focused tests.</span>
            </p>

            <p className="mock-claude-response">
              <span aria-hidden="true">●</span>
              <span>
                I’ll trace the callback, update the handler, then verify it.
              </span>
            </p>

            <div className="mock-claude-actions">
              {INITIAL_ACTIONS.map(([action, detail]) => (
                <p key={action}>
                  <span aria-hidden="true">⎿</span>
                  <strong>{action}</strong> {detail}
                </p>
              ))}
            </div>

            <p className="mock-claude-error">
              <span aria-hidden="true">⎿</span>
              <span>Test failed · expected /dashboard · received /</span>
            </p>

            <p className="mock-claude-response mock-claude-final">
              <span aria-hidden="true">●</span>
              <span>
                The redirect behavior is ambiguous. Which route should win?
              </span>
            </p>

            <p className="mock-claude-worked">✻ Worked for 2m 14s</p>

            {submittedPrompt ? (
              <>
                <p className="mock-claude-prompt mock-claude-new-line">
                  <span aria-hidden="true">❯</span>
                  <span>{submittedPrompt}</span>
                </p>
                <p className="mock-claude-response mock-claude-install-response mock-claude-new-line">
                  <span aria-hidden="true">●</span>
                  <span>
                    To try Side Glance,{" "}
                    <a
                      href="https://github.com/AndrewUlloa/side-glance#installation-status"
                      rel="noreferrer"
                      target="_blank"
                    >
                      install the public beta.
                    </a>
                  </span>
                </p>
              </>
            ) : null}
          </div>

          <div className="mock-claude-input-shell">
            {isMenuOpen ? (
              <SlashCommandMenu
                activeItemIndex={activeItemIndex}
                commands={filteredCommands}
                menuMode={menuMode}
                models={filteredModels}
                onActiveItemChange={setActiveItemIndex}
                onCommandSelect={selectCommand}
                onModelSelect={selectModel}
                selectedModel={selectedModel}
              />
            ) : null}

            <form className="mock-claude-composer" onSubmit={handleSubmit}>
              <span aria-hidden="true">❯</span>
              <input
                aria-activedescendant={activeDescendant}
                aria-autocomplete="list"
                aria-controls={isMenuOpen ? COMMAND_MENU_ID : undefined}
                aria-expanded={isMenuOpen}
                aria-label="Ask Claude to continue"
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                maxLength={INPUT_MAX_LENGTH}
                name="follow-up"
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                placeholder="Add a follow-up · / for commands"
                role="combobox"
                spellCheck={false}
                type="text"
                value={draft}
              />
            </form>
          </div>

          <footer className="mock-claude-chrome">
            <p>
              <span>[LW1]</span>
              <strong>{selectedModelLabel}</strong>
              <span>side-glance</span>
              <span>ctx ▰▰▱▱ 38%</span>
            </p>
            <p>
              <strong>▶ auto mode on</strong>
              <span>/ commands · Demo only · nothing is sent or saved</span>
            </p>
          </footer>
        </section>

        <span aria-live="polite" className="sr-only">
          {announcement}
        </span>
      </div>
    </section>
  );
}
