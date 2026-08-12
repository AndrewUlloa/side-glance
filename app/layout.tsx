import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://terminal-signal.pages.dev"),
  title: "Signal — attention for coding agents",
  description:
    "A local-first terminal and tmux attention layer for Claude Code, Codex, Gemini CLI, OpenCode, Aider, and any coding CLI.",
  applicationName: "Signal",
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
    title: "Signal — your terminal knows when it needs you",
    description:
      "Local-first lifecycle attention for coding-agent CLIs, with safe ordering, cleanup, and restoration.",
    siteName: "Signal",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Signal — attention for coding agents",
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
  themeColor: "#0a0d0c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
