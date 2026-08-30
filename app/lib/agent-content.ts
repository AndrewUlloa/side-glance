import { SIDE_GLANCE_SITE_URL } from "./site-identity.ts";

const MARKDOWN_SUFFIX = /\.md$/u;

export interface SitePageContent {
  description: string;
  links: readonly {
    description: string;
    href: string;
    label: string;
  }[];
  markdownPath: string;
  path: string;
  sections: readonly {
    heading: string;
    paragraphs: readonly string[];
  }[];
  title: string;
}

export const HOME_PAGE_CONTENT: SitePageContent = {
  title: "Side Glance",
  description:
    "See whether coding-agent sessions are working, waiting, ready, or failed in the terminal or tmux.",
  path: "/",
  markdownPath: "/index.md",
  sections: [
    {
      heading: "What Side Glance does",
      paragraphs: [
        "Side Glance turns local coding-agent lifecycle events into terminal color and tmux markers. You can see whether each session is working, waiting, ready, or failed without reopening every terminal tab or pane.",
        "The CLI runs locally and does not operate a hosted service or collect telemetry. Prompts, responses, and transcripts are not protocol fields or saved state.",
      ],
    },
    {
      heading: "Four sessions. One clear glance.",
      paragraphs: [
        "You start a few agents, then return to another task. One finishes. Another needs permission. A third fails. Side Glance keeps the best-known state where the work is already running.",
        "Side Glance is not a remote agent orchestrator or transcript summarizer. After power loss, SIGKILL, or terminal-emulator failure, it reconciles state on the next affected event; it does not promise synchronous cleanup.",
      ],
    },
    {
      heading: "How it works",
      paragraphs: [
        "Run side-glance init to detect supported provider CLIs and review every owned change before it writes. Then start a configured agent normally. Side Glance reduces supported lifecycle events to the best-known state and renders it in the terminal or tmux.",
        "Claude Code and Codex are locally contract-audited. Gemini, OpenCode v1, and Aider remain experimental until their live provider matrices pass. Stable v0.1 supports Apple Silicon macOS and glibc Linux through Homebrew. npm is available as a durable fallback; Intel macOS remains experimental.",
      ],
    },
  ],
  links: [
    {
      label: "About Side Glance",
      href: `${SIDE_GLANCE_SITE_URL}/about`,
      description:
        "Origin, design influences, safety principles, and current support status.",
    },
    {
      label: "Contact and support",
      href: `${SIDE_GLANCE_SITE_URL}/contact`,
      description:
        "Where to ask setup questions, report bugs, or disclose security issues.",
    },
    {
      label: "Privacy",
      href: `${SIDE_GLANCE_SITE_URL}/privacy`,
      description: "How the website and local CLI handle data.",
    },
  ],
};

export const ABOUT_PAGE_CONTENT: SitePageContent = {
  title: "About Side Glance",
  description:
    "Why Andrew Ulloa built Side Glance, how Shisa Kanko influenced its design, and what the coding-agent CLI supports today.",
  path: "/about",
  markdownPath: "/about.md",
  sections: [
    {
      heading: "Why I built Side Glance",
      paragraphs: [
        "I built Side Glance after repeatedly reopening several agent terminals to see which one was still working, waiting for input, ready for review, or failed.",
        "The first version was stoplight.sh, a personal Claude Code hook that turned those states into terminal color. Side Glance originated at Design From, Inc.; I maintain it as Apache-2.0 open source.",
      ],
    },
    {
      heading: "The design influence",
      paragraphs: [
        "The design was influenced by Christopher Roosen's 2020 essay on Shisa Kanko, the Japanese practice of pointing and calling. The connection is its broader lesson about external cognition: important operational state is easier to act on when it is visible in the environment instead of held entirely in memory.",
        "Side Glance is not digital pointing and calling. Shisa Kanko is an active, embodied ritual; Side Glance applies one narrower design principle through an ambient terminal signal. Roosen's 2024 follow-up returns to the practice through examples involving everyday attention, distraction, and multitasking.",
      ],
    },
    {
      heading: "Local-first by design",
      paragraphs: [
        "Side Glance treats hook payloads, session identifiers, paths, labels, and persisted state as untrusted input. It stores typed JSON and never sources state as shell code. Prompts, responses, and transcripts are not protocol fields or saved state. Terminal bytes are written only after the target is verified as an owned character TTY.",
        "Concurrency rules are explicit. Delayed generations, older timestamps, mismatched turn identifiers, and duplicate events cannot repaint newer state. Releasing one session removes only that session's lease and recomputes the shared surface from the leases that remain.",
      ],
    },
    {
      heading: "Current scope and limits",
      paragraphs: [
        "Claude Code and Codex are locally contract-audited. Gemini, OpenCode v1, and Aider are experimental until their live binary matrices pass. The supported v0.1 path is Homebrew on Apple Silicon macOS or glibc Linux, with global npm as a durable fallback. Intel macOS remains experimental, while Windows and musl-based Linux are not supported yet.",
        "Normal session-end and signal paths release through the serialized controller. No software can synchronously guarantee cleanup after every component receives SIGKILL, after power loss, or after a terminal emulator disappears. Side Glance describes those cases as recovery and reconciliation, and exposes explicit diagnosis and reset commands instead of making an impossible lifecycle guarantee.",
      ],
    },
  ],
  links: [
    {
      label: "Source repository",
      href: "https://github.com/AndrewUlloa/side-glance",
      description: "Code, releases, architecture, and contribution history.",
    },
    {
      label: "Christopher Roosen: Shisa Kanko",
      href: "https://www.christopherroosen.com/blog/2020/4/20/how-the-ritual-of-pointing-and-calling-shisa-kanko-embeds-us-in-the-world",
      description:
        "The 2020 essay that influenced Side Glance's external-state design principle.",
    },
    {
      label: "Christopher Roosen: A Return to Shisha Kanko",
      href: "https://www.christopherroosen.com/blog/2024/6/30/shisha-kanko-pointing-calling-redux",
      description:
        "The 2024 follow-up on pointing and calling in everyday attention.",
    },
    {
      label: "Contact and support",
      href: `${SIDE_GLANCE_SITE_URL}/contact`,
      description: "Support and security-reporting routes.",
    },
  ],
};

export const CONTACT_PAGE_CONTENT: SitePageContent = {
  title: "Contact and support",
  description:
    "Public support, bug-reporting, feature-proposal, and private security channels for Side Glance.",
  path: "/contact",
  markdownPath: "/contact.md",
  sections: [
    {
      heading: "Originating organization",
      paragraphs: [
        "Side Glance originated at Design From, Inc. in New York and is maintained by Andrew Ulloa. Public project correspondence can be sent to andrew@designfrom.com. Product support, reproducible bugs, and confidential security reports should still use the dedicated GitHub routes below so each request reaches the appropriate workflow.",
      ],
    },
    {
      heading: "Setup and usage help",
      paragraphs: [
        "Use GitHub Discussions for setup questions, usage help, and workflow guidance. Before asking about terminal color behavior, run side-glance doctor --json and include the Side Glance version, operating system, terminal, shell, tmux version when applicable, provider CLI and version, and sanitized diagnostics.",
        "Never include prompts, transcripts, access tokens, private repository paths, or unredacted provider configuration in a support request. Side Glance is designed to work from lifecycle metadata; support should not need the content of your coding session.",
      ],
    },
    {
      heading: "Bugs and feature proposals",
      paragraphs: [
        "Use the public GitHub issue tracker for reproducible bugs and concrete feature proposals. A useful report explains the expected behavior, the observed behavior, a minimal reproduction, relevant sanitized doctor output, and whether tmux or a direct terminal owns the surface. Search existing issues before opening a duplicate.",
        "Provider capabilities differ, so include the provider and exact CLI version. Configuration alone is not proof that a desktop notification was displayed or that a sound was audible; operating-system notification settings and Focus modes can suppress delivery.",
      ],
    },
    {
      heading: "Security reports",
      paragraphs: [
        "Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability report for the Side Glance repository. Include the affected version and platform, reproduction steps, potential impact, and any suggested mitigation. Avoid attaching real credentials, transcripts, or other sensitive user data.",
        "Security fixes target the newest published stable release. The main branch is development code rather than a supported release channel. The private vulnerability-reporting route is the appropriate contact point for coordinated disclosure.",
      ],
    },
  ],
  links: [
    {
      label: "GitHub Discussions",
      href: "https://github.com/AndrewUlloa/side-glance/discussions",
      description: "Setup questions and usage help.",
    },
    {
      label: "Issue tracker",
      href: "https://github.com/AndrewUlloa/side-glance/issues",
      description: "Reproducible bugs and feature proposals.",
    },
    {
      label: "Private vulnerability report",
      href: "https://github.com/AndrewUlloa/side-glance/security/advisories/new",
      description: "Confidential security disclosures.",
    },
  ],
};

export const PRIVACY_PAGE_CONTENT: SitePageContent = {
  title: "Privacy",
  description:
    "How the Side Glance website and local-first CLI handle information.",
  path: "/privacy",
  markdownPath: "/privacy.md",
  sections: [
    {
      heading: "Website data",
      paragraphs: [
        "The Side Glance website is a Next.js application hosted by Vercel, proxied through Cloudflare, with substantial public media delivered from Cloudflare R2. Those infrastructure providers may process ordinary request information such as IP addresses, user agents, requested URLs, timestamps, and security signals according to their own service policies and retention practices.",
        "Cloudflare Web Analytics automatically measures aggregate real-user traffic for sideglance.dev. Vercel Web Analytics measures page views and three anonymous custom interactions: a successful install-command copy, a header GitHub open, and the first meaningful demo engagement in a browser-tab session. Those events contain only static labels such as homebrew, header, lifecycle, color_model, or terminal_input; they never contain prompt text or other user-provided content.",
        "The site stores a light-or-dark theme preference in localStorage and a side-glance:demo-engaged marker in sessionStorage so the demo event is sent at most once per browser-tab session. The interactive terminal demonstration runs in the page; prompt text stays in that tab and is not sent to Side Glance or saved by the demo.",
        "The site's Content Signals allow search indexing and AI-assisted retrieval while reserving the content from model training. These preferences are published in robots.txt as ai-train=no, search=yes, and ai-input=yes.",
      ],
    },
    {
      heading: "CLI data",
      paragraphs: [
        "The Side Glance CLI is local-first. It processes bounded lifecycle events and stores typed state in the user's local Side Glance data location. Prompts, responses, and transcripts are not protocol fields or saved state. Optional user-supplied labels are sanitized and bounded before they can appear in desktop notifications.",
        "Provider setup changes local configuration only after review and confirmation. Setup preserves unrelated settings, and uninstall removes only Side Glance-owned handlers. Doctor output is generated locally; it should be reviewed and sanitized before a user chooses to share it in a support request.",
      ],
    },
    {
      heading: "External services and links",
      paragraphs: [
        "Installation may contact Homebrew, npm, GitHub, and their distribution infrastructure at the user's direction. Links on this site lead to GitHub for source code, public support, issue reporting, and private vulnerability reports. Information submitted to those services is governed by the account settings and privacy terms of the service receiving it.",
        "Side Glance does not claim that provider CLIs, terminals, package registries, hosting platforms, or operating-system notification services follow this project's local data boundaries. Review those products' policies separately when deciding what information to provide to them.",
      ],
    },
    {
      heading: "Choices and questions",
      paragraphs: [
        "You can clear the website theme preference through browser storage controls. You can stop using the site without creating an account, and you can uninstall or reset the CLI using its documented commands. Avoid submitting sensitive session content through public support channels.",
        "Privacy or security questions should use the contact routes listed on the Contact page. Suspected vulnerabilities belong in the private vulnerability report rather than a public issue. This notice was last updated on August 29, 2026 and should be revised whenever the website's data flow or the CLI's content boundaries change.",
      ],
    },
  ],
  links: [
    {
      label: "Contact and support",
      href: `${SIDE_GLANCE_SITE_URL}/contact`,
      description: "Questions and private security-reporting guidance.",
    },
    {
      label: "Source repository",
      href: "https://github.com/AndrewUlloa/side-glance",
      description:
        "Inspect the open-source implementation and documented data boundaries.",
    },
  ],
};

export const SITE_PAGE_CONTENT = [
  HOME_PAGE_CONTENT,
  ABOUT_PAGE_CONTENT,
  CONTACT_PAGE_CONTENT,
  PRIVACY_PAGE_CONTENT,
] as const;

const pageByPath = new Map(
  SITE_PAGE_CONTENT.flatMap((page) => [
    [page.path, page],
    [page.markdownPath.replace(MARKDOWN_SUFFIX, ""), page],
  ])
);

export const pageContentForPath = (path: string) => pageByPath.get(path);

export const renderPageMarkdown = (page: SitePageContent) => {
  const sections = page.sections.flatMap((section) => [
    `## ${section.heading}`,
    ...section.paragraphs,
  ]);
  const links = page.links.map(
    (link) => `- [${link.label}](${link.href}): ${link.description}`
  );

  return [
    `# ${page.title}`,
    `> ${page.description}`,
    ...sections,
    "## Related resources",
    ...links,
  ].join("\n\n");
};

export const MARKDOWN_NOT_FOUND = `# 404 — Page not found

The requested Side Glance path does not exist.

## Where to look next

- [Homepage](https://sideglance.dev/): Product overview and installation path.
- [Sitemap](https://sideglance.dev/sitemap.xml): Every indexable page on this site.
- [Agent instructions](https://sideglance.dev/llms.txt): Agent-oriented site guide and Markdown links.
- [Source repository](https://github.com/AndrewUlloa/side-glance): Documentation, releases, and support routes.
`;
