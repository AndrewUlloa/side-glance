"use client";

import { useEffect } from "react";

interface WebMcpResult {
  content: Array<{
    text: string;
    type: "text";
  }>;
}

interface WebMcpTool {
  description: string;
  execute: (input: Record<string, unknown>) => Promise<WebMcpResult>;
  inputSchema: Record<string, unknown>;
  name: string;
}

interface WebMcpModelContext {
  registerTool: (
    tool: WebMcpTool,
    options: { signal: AbortSignal }
  ) => Promise<void> | void;
}

interface LegacyWebMcpModelContext {
  provideContext: (context: { tools: WebMcpTool[] }) => Promise<void> | void;
}

declare global {
  interface Document {
    modelContext?: WebMcpModelContext;
  }

  interface Navigator {
    modelContext?: LegacyWebMcpModelContext;
  }
}

const textResult = (text: string): WebMcpResult => ({
  content: [{ type: "text", text }],
});

const tools: WebMcpTool[] = [
  {
    name: "get-side-glance-install-command",
    description:
      "Return the supported stable command for installing and configuring Side Glance without executing it.",
    inputSchema: {
      type: "object",
      properties: {
        method: {
          type: "string",
          enum: ["homebrew", "npm"],
          description: "Preferred installation method.",
        },
      },
      additionalProperties: false,
    },
    execute: (input) => {
      const command =
        input.method === "npm"
          ? "npm install --global side-glance@latest && side-glance init"
          : "brew install AndrewUlloa/tap/side-glance && side-glance init";
      return Promise.resolve(textResult(command));
    },
  },
  {
    name: "get-side-glance-project-info",
    description:
      "Return Side Glance's purpose, privacy boundary, supported platforms, and canonical discovery resources.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execute: () =>
      Promise.resolve(
        textResult(
          JSON.stringify({
            name: "Side Glance",
            originatedBy: "Design From, Inc.",
            description:
              "A local-first attention layer for coding-agent CLIs that reports lifecycle state in terminals and tmux.",
            privacy:
              "Side Glance does not read or persist prompts, responses, or transcripts by default.",
            supportedPlatforms: ["Apple Silicon macOS", "glibc Linux"],
            homepage: "https://sideglance.dev",
            instructions: "https://sideglance.dev/llms.txt",
            skillIndex:
              "https://sideglance.dev/.well-known/agent-skills/index.json",
          })
        )
      ),
  },
];

export function WebMcpTools() {
  useEffect(() => {
    const { modelContext } = document;
    if (modelContext) {
      const controller = new AbortController();
      for (const tool of tools) {
        Promise.resolve(
          modelContext.registerTool(tool, { signal: controller.signal })
        ).catch(() => {
          // Experimental implementations can reject unsupported schemas. The
          // site remains fully usable when WebMCP registration is unavailable.
        });
      }

      return () => controller.abort();
    }

    const legacyModelContext = navigator.modelContext;
    if (!legacyModelContext) {
      return;
    }

    Promise.resolve(legacyModelContext.provideContext({ tools })).catch(() => {
      // The early-preview navigator API remains a feature-detected fallback
      // for agents that have not adopted document.modelContext yet.
    });

    return () => {
      Promise.resolve(legacyModelContext.provideContext({ tools: [] })).catch(
        () => {
          // Navigation disposes the page even if an experimental API cannot
          // explicitly clear its context.
        }
      );
    };
  }, []);

  return null;
}
