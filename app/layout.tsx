// biome-ignore-all lint/security/noDangerouslySetInnerHtml: The fixed theme bootstrap contains no user data and must run before first paint.
import type { Metadata, Viewport } from "next";
import { Alan_Sans, Geist_Mono } from "next/font/google";
import Script from "next/script";
import type { CSSProperties } from "react";
import "lenis/dist/lenis.css";
import { AgentationToolbar } from "./components/AgentationToolbar";
import { SmoothScroll } from "./components/SmoothScroll";
import { shouldShowAgentation } from "./lib/agentation-environment";
import { SIDE_GLANCE_SITE_URL, SITE_ASSETS } from "./lib/site-assets";
import "./globals.css";

const showAgentation = shouldShowAgentation({
  nodeEnv: process.env.NODE_ENV,
  vercelEnv: process.env.VERCEL_ENV,
});
const cloudflareAnalyticsToken =
  process.env.NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN;
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
  title: "Side Glance — Long loops. Short glances.",
  description: "Know which loop needs judgment. Let the others keep running.",
  applicationName: "Side Glance",
  alternates: {
    canonical: "/",
  },
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
    title: "Side Glance — Long loops. Short glances.",
    description: "Know which loop needs judgment. Let the others keep running.",
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
    title: "Side Glance — Long loops. Short glances.",
    description: "Know which loop needs judgment. Let the others keep running.",
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
      <body className={`${alanSans.variable} ${geistMono.variable}`}>
        <Script
          dangerouslySetInnerHTML={{ __html: themeBootstrap }}
          id="side-glance-theme-bootstrap"
          strategy="beforeInteractive"
        />
        <SmoothScroll />
        {children}
        <AgentationToolbar enabled={showAgentation} />
        {cloudflareAnalyticsToken ? (
          <Script
            data-cf-beacon={JSON.stringify({
              token: cloudflareAnalyticsToken,
            })}
            src="https://static.cloudflareinsights.com/beacon.min.js"
            strategy="afterInteractive"
          />
        ) : null}
      </body>
    </html>
  );
}
