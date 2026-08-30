import { createHash } from "node:crypto";

import {
  SIDE_GLANCE_ORGANIZATION_NAME,
  SIDE_GLANCE_SITE_URL,
} from "./site-identity.ts";

export const AGENT_DISCOVERY_CACHE_CONTROL =
  "public, s-maxage=300, stale-while-revalidate=86400";

export const SIDE_GLANCE_SKILL_MARKDOWN = `---
name: side-glance
description: Install, configure, and verify Side Glance terminal and tmux status for local coding-agent CLIs.
---

# Side Glance

Side Glance is an open-source, local-first CLI that turns supported coding-agent lifecycle events into terminal color and tmux markers. It keeps the best-known working, waiting, ready, failed, or inactive state visible without repeatedly reopening terminal tabs or panes.

## When to use Side Glance

Use Side Glance when coding-agent sessions run long enough for a developer to switch tasks, then reopen each terminal to learn what changed. Claude Code and Codex are locally contract-audited; Gemini, OpenCode v1, and Aider remain experimental.

Do not use Side Glance as a remote orchestrator, transcript summarizer, or guarantee of cleanup after SIGKILL, power loss, or terminal-emulator failure. Those cases require recovery and ownership reconciliation.

## Prerequisites

- Apple Silicon macOS or glibc Linux for the supported v0.1 path; Intel macOS is experimental.
- Homebrew is recommended; npm is the durable fallback.
- A supported coding-agent CLI and a terminal or tmux session the user controls.

## Install and configure

Prefer guided setup so the user can review every owned change:

~~~sh
brew install AndrewUlloa/tap/side-glance
side-glance init
~~~

If Homebrew is unavailable:

~~~sh
npx side-glance@latest init
~~~

Do not silently replace provider hooks or unrelated notification commands. Guided setup previews Side Glance-owned changes and preserves unrelated configuration.

## Verify

Run local diagnostics after setup:

~~~sh
side-glance doctor --json
~~~

Confirm the installed version, platform, provider adapter, target terminal ownership, and tmux state when applicable. Never include prompts, transcripts, credentials, or unredacted private paths in shared diagnostics.

## Data and safety boundaries

Side Glance's state protocol and saved state exclude prompts, responses, and transcripts. It processes bounded lifecycle metadata, stores typed local state, treats all hook payloads as untrusted, and writes terminal bytes only after verifying an owned character TTY.

## Canonical resources

- Product and limits: https://sideglance.dev/about.md
- Contact and security reporting: https://sideglance.dev/contact.md
- Privacy: https://sideglance.dev/privacy.md
- Source: https://github.com/AndrewUlloa/side-glance
`;

const skillDigest = `sha256:${createHash("sha256")
  .update(SIDE_GLANCE_SKILL_MARKDOWN)
  .digest("hex")}`;

export const SIDE_GLANCE_SKILL_INDEX = {
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  skills: [
    {
      name: "side-glance",
      type: "skill-md",
      description:
        "Install, configure, and verify Side Glance terminal and tmux status for local coding-agent CLIs.",
      url: `${SIDE_GLANCE_SITE_URL}/.well-known/agent-skills/side-glance/SKILL.md`,
      digest: skillDigest,
    },
  ],
} as const;

export const SIDE_GLANCE_ARD_CATALOG = {
  specVersion: "1.0",
  host: {
    displayName: SIDE_GLANCE_ORGANIZATION_NAME,
    identifier: "did:web:sideglance.dev",
  },
  entries: [
    {
      identifier: "urn:air:sideglance.dev:skill:side-glance",
      displayName: "Side Glance installation and verification skill",
      type: "text/markdown",
      url: `${SIDE_GLANCE_SITE_URL}/.well-known/agent-skills/side-glance/SKILL.md`,
      representativeQueries: [
        "install Side Glance for my coding-agent terminal workflow",
        "configure Side Glance for Claude Code or Codex",
        "verify that Side Glance owns the correct terminal or tmux surface",
        "diagnose Side Glance without sharing prompts or transcripts",
      ],
    },
    {
      identifier: "urn:air:sideglance.dev:api:agent-discovery",
      displayName: "Side Glance public agent-discovery API",
      type: "application/json",
      url: `${SIDE_GLANCE_SITE_URL}/openapi.json`,
      representativeQueries: [
        "discover Side Glance machine-readable resources",
        "check whether Side Glance agent discovery is available",
        "find the Side Glance skill index and ARD manifest",
      ],
    },
  ],
} as const;

export const SIDE_GLANCE_API_CATALOG = {
  linkset: [
    {
      anchor: `${SIDE_GLANCE_SITE_URL}/#agent-discovery-api`,
      "service-desc": [
        {
          href: `${SIDE_GLANCE_SITE_URL}/openapi.json`,
          type: "application/vnd.oai.openapi+json;version=3.1",
        },
      ],
      "service-doc": [
        {
          href: `${SIDE_GLANCE_SITE_URL}/llms.txt`,
          type: "text/plain",
        },
      ],
      status: [
        {
          href: `${SIDE_GLANCE_SITE_URL}/api/status`,
          type: "application/json",
        },
      ],
    },
  ],
} as const;

const successResponse = (description: string, contentType: string) => ({
  description,
  content: {
    [contentType]: {
      schema: { type: "object" },
    },
  },
});

export const SIDE_GLANCE_OPENAPI = {
  openapi: "3.1.0",
  info: {
    title: "Side Glance Agent Discovery API",
    version: "1.0.0",
    description:
      "Public, read-only discovery documents for Side Glance. No authentication or registration is required.",
  },
  servers: [{ url: SIDE_GLANCE_SITE_URL }],
  paths: {
    "/.well-known/agent-skills/index.json": {
      get: {
        operationId: "getAgentSkillsIndex",
        summary: "Discover Side Glance agent skills",
        responses: {
          "200": successResponse(
            "Agent Skills discovery index",
            "application/json"
          ),
        },
      },
    },
    "/.well-known/ai-catalog.json": {
      get: {
        operationId: "getAgenticResourceCatalog",
        summary: "Discover Side Glance agentic resources",
        responses: {
          "200": successResponse("ARD capability manifest", "application/json"),
        },
      },
    },
    "/api/status": {
      get: {
        operationId: "getAgentDiscoveryStatus",
        summary: "Check the public discovery surface",
        responses: {
          "200": successResponse(
            "Discovery service is available",
            "application/json"
          ),
        },
      },
    },
  },
} as const;

export const SIDE_GLANCE_AUTH_MARKDOWN = `# Side Glance auth.md

Side Glance does not operate a hosted account system, protected product API, remote agent, or MCP server.

## Agent audience

Public discovery documents are available to agents that need to evaluate, install, configure, or verify the local Side Glance CLI.

## Registration and credentials

No registration or credentials are required. The public discovery API is read-only and does not issue access tokens, API keys, or agent identities. The local CLI uses the developer's existing provider installation and does not provision credentials for agents.

## Public resources

- Agent skill index: https://sideglance.dev/.well-known/agent-skills/index.json
- ARD manifest: https://sideglance.dev/.well-known/ai-catalog.json
- API catalog: https://sideglance.dev/.well-known/api-catalog
- Agent instructions: https://sideglance.dev/llms.txt
`;
