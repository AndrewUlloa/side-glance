import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "lenis/dist/lenis.css";
import { AgentationToolbar } from "./components/AgentationToolbar";
import { SmoothScroll } from "./components/SmoothScroll";
import { shouldShowAgentation } from "./lib/agentation-environment";
import "./globals.css";

const productionHostname = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const siteUrl = productionHostname
  ? `https://${productionHostname}`
  : "https://side-glance.vercel.app";
const showAgentation = shouldShowAgentation({
  nodeEnv: process.env.NODE_ENV,
  vercelEnv: process.env.VERCEL_ENV,
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Side Glance — attention for coding agents",
  description:
    "A local-first terminal and tmux attention layer for Claude Code, Codex, Gemini CLI, OpenCode, Aider, and any coding CLI.",
  applicationName: "Side Glance",
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
    title: "Side Glance — your terminal knows when it needs you",
    description:
      "Local-first lifecycle attention for coding-agent CLIs, with safe ordering, cleanup, and restoration.",
    siteName: "Side Glance",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Side Glance — attention for coding agents",
    description:
      "A quiet thermal status layer across terminal backgrounds and tmux.",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#08090a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${geistMono.variable}`}>
        <SmoothScroll />
        {children}
        <AgentationToolbar enabled={showAgentation} />
      </body>
    </html>
  );
}
