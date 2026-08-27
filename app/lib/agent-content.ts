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
    "A local-first attention layer that turns coding-agent lifecycle events into calm terminal and tmux status.",
  path: "/",
  markdownPath: "/index.md",
  sections: [
    {
      heading: "What Side Glance does",
      paragraphs: [
        "Side Glance is a local-first attention layer for coding-agent command-line interfaces. It translates working, waiting, ready, failed, and inactive lifecycle events into ambient terminal or tmux status, so a developer can see which session needs judgment without opening another dashboard or repeatedly polling tabs.",
        "The protocol carries bounded lifecycle state rather than session content. Prompts, responses, and transcripts are not part of the protocol and are not persisted by default. Shared terminal surfaces have deterministic ownership so an older event or one session's cleanup cannot overwrite a newer session's state.",
      ],
    },
    {
      heading: "When Side Glance helps",
      paragraphs: [
        "Use Side Glance when you run one or more long-lived coding-agent sessions and want their need for attention to remain visible in the terminal. It is a good fit for parallel Claude Code or Codex work, supervised tmux sessions, and local workflows where completion, waiting, and failure should be distinguishable without reading the underlying conversation.",
        "Side Glance is not a remote agent orchestrator, transcript summarizer, or promise of cleanup after power loss, SIGKILL, or terminal-emulator failure. Those cases use explicit recovery and ownership reconciliation on the next affected event.",
      ],
    },
    {
      heading: "How it fits your workflow",
      paragraphs: [
        "Guided setup detects supported provider CLIs without executing them, previews the changes Side Glance owns, and preserves unrelated configuration. A supervised wrapper supplies a stable surface identity for direct terminals or tmux, while provider adapters supply lifecycle events. Status is the default theme; Heat and validated custom colors are optional.",
        "Claude Code and Codex are locally contract-audited. Gemini, OpenCode v1, and Aider remain experimental until their live provider matrices pass. The public beta supports macOS and glibc Linux through Homebrew, with npm available as a durable fallback.",
      ],
    },
  ],
  links: [
    {
      label: "About Side Glance",
      href: `${SIDE_GLANCE_SITE_URL}/about`,
      description:
        "Product scope, design principles, and current support status.",
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
    "Side Glance is an open-source, local-first attention layer for coding-agent CLIs.",
  path: "/about",
  markdownPath: "/about.md",
  sections: [
    {
      heading: "Why Side Glance exists",
      paragraphs: [
        "Side Glance was built for developers who run long-lived coding-agent sessions and have become the watcher of their own automation. A loop may still be working, may need input, may be ready for review, or may have failed. Side Glance makes those lifecycle states ambient in the terminal so attention can stay on the next decision or the work already in the foreground.",
        "The project is the tested successor to a personal stoplight script: one typed controller, one private state store, thin provider adapters, and a universal supervised wrapper. Side Glance originated at Design From, Inc. and is maintained by Andrew Ulloa as an Apache-2.0 open-source project.",
      ],
    },
    {
      heading: "Local-first by design",
      paragraphs: [
        "Side Glance treats hook payloads, session identifiers, paths, labels, and persisted state as untrusted input. It stores typed JSON and never sources state as shell code. Prompt, response, and transcript content are outside the protocol and are not persisted by default. Terminal bytes are written only after the target is verified as an owned character TTY.",
        "Concurrency rules are explicit. Delayed generations, older timestamps, mismatched turn identifiers, and duplicate events cannot repaint newer state. Releasing one session removes only that session's lease and recomputes the shared surface from the leases that remain.",
      ],
    },
    {
      heading: "Current scope and limits",
      paragraphs: [
        "Claude Code and Codex are locally contract-audited. Gemini, OpenCode v1, and Aider are experimental until their live binary matrices pass. The supported public-beta path is Homebrew on Apple Silicon macOS or glibc Linux, with global npm as a durable fallback. Intel macOS remains experimental, while Windows and musl-based Linux are not supported yet.",
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
        "Use GitHub Discussions for setup questions, usage help, and workflow guidance once discussions are enabled. Before asking about terminal color behavior, run side-glance doctor --json and include the Side Glance version, operating system, terminal, shell, tmux version when applicable, provider CLI and version, and sanitized diagnostics.",
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
        "Until Side Glance reaches version 1.0, security fixes target the newest published beta. The main branch is development code rather than a supported release channel. The private vulnerability-reporting route is the appropriate contact point for coordinated disclosure.",
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
        "When the deployment is configured with a Cloudflare Web Analytics token, Cloudflare Web Analytics measures aggregate site traffic. The site stores a light-or-dark theme preference in local browser storage. The interactive terminal demonstration runs in the page and is labeled as a demo; its sample input is not sent to Side Glance or saved by the demo.",
        "The site's Content Signals allow search indexing and AI-assisted retrieval while reserving the content from model training. These preferences are published in robots.txt as ai-train=no, search=yes, and ai-input=yes.",
      ],
    },
    {
      heading: "CLI data",
      paragraphs: [
        "The Side Glance CLI is local-first. It processes bounded lifecycle events and stores typed state in the user's local Side Glance data location. Prompt text, response text, and full transcripts are not part of the protocol and are not persisted by default. Optional user-supplied labels are sanitized and bounded before they can appear in desktop notifications.",
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
        "Privacy or security questions should use the contact routes listed on the Contact page. Suspected vulnerabilities belong in the private vulnerability report rather than a public issue. This notice was last updated on August 27, 2026 and should be revised whenever the website's data flow or the CLI's content boundaries change.",
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
