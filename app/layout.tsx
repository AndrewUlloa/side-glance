// biome-ignore-all lint/security/noDangerouslySetInnerHtml: Fixed theme and JSON-LD payloads contain no user data; the theme must run before first paint and JSON-LD must remain parseable in raw HTML.
import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Alan_Sans, Geist_Mono } from "next/font/google";
import Script from "next/script";
import type { CSSProperties } from "react";
import "lenis/dist/lenis.css";
import { AgentationToolbar } from "./components/AgentationToolbar";
import { SiteHeader } from "./components/SiteHeader";
import { SmoothScroll } from "./components/SmoothScroll";
import { WebMcpTools } from "./components/WebMcpTools";
import { shouldShowAgentation } from "./lib/agentation-environment";
import { SITE_ASSETS } from "./lib/site-assets";
import { SIDE_GLANCE_SITE_URL } from "./lib/site-identity";
import { SIDE_GLANCE_STRUCTURED_DATA_JSON } from "./lib/structured-data";
import "./globals.css";

const showAgentation = shouldShowAgentation({
  nodeEnv: process.env.NODE_ENV,
  vercelEnv: process.env.VERCEL_ENV,
});
const rootStyle = {
  "--side-glance-hero-surface": `url("${SITE_ASSETS.heroSurface}")`,
} as CSSProperties;

const themeBootstrap = `(() => {
  let storedTheme = null;
  try {
    storedTheme = localStorage.getItem("side-glance-theme")
      ?? localStorage.getItem("signal-theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      localStorage.setItem("side-glance-theme", storedTheme);
      localStorage.removeItem("signal-theme");
    }
  } catch {}
  const theme = storedTheme === "light" || storedTheme === "dark"
    ? storedTheme
    : matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})()`;

const alanSans = Alan_Sans({
  variable: "--font-alan-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SIDE_GLANCE_SITE_URL),
  title: "Coding Agent Status for Terminal & tmux | Side Glance",
  description:
    "See when Claude Code, Codex, and other coding agents are working, waiting, ready, or failed. Side Glance keeps status local in your terminal or tmux.",
  applicationName: "Side Glance",
  alternates: {
    canonical: "/",
    types: {
      "text/markdown": "/index.md",
    },
  },
  authors: [{ name: "Andrew Ulloa", url: "https://github.com/AndrewUlloa" }],
  category: "developer tools",
  creator: "Design From, Inc.",
  publisher: "Design From, Inc.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Side Glance",
  },
  keywords: [
    "coding agents",
    "terminal",
    "tmux",
    "Claude Code",
    "Codex",
    "developer tools",
  ],
  openGraph: {
    type: "website",
    title: "Coding Agent Status for Terminal & tmux | Side Glance",
    description:
      "See which coding-agent session needs attention without reopening every terminal tab or pane.",
    siteName: "Side Glance",
    url: SIDE_GLANCE_SITE_URL,
    images: [
      {
        url: SITE_ASSETS.openGraph,
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "Side Glance — Long loops. Short glances.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Coding Agent Status for Terminal & tmux | Side Glance",
    description:
      "See which coding-agent session needs attention without reopening every terminal tab or pane.",
    images: [
      {
        url: SITE_ASSETS.openGraph,
        width: 1200,
        height: 630,
        alt: "Side Glance — Long loops. Short glances.",
      },
    ],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#08090a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={rootStyle} suppressHydrationWarning>
      <head>
        <link
          href="/.well-known/ai-catalog.json"
          rel="ai-catalog"
          type="application/json"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: SIDE_GLANCE_STRUCTURED_DATA_JSON,
          }}
          type="application/ld+json"
        />
      </head>
      <body className={`${alanSans.variable} ${geistMono.variable}`}>
        <Script
          dangerouslySetInnerHTML={{ __html: themeBootstrap }}
          id="side-glance-theme-bootstrap"
          strategy="beforeInteractive"
        />
        <SmoothScroll />
        <WebMcpTools />
        <SiteHeader />
        {children}
        <AgentationToolbar enabled={showAgentation} />
        <Analytics />
      </body>
    </html>
  );
}
