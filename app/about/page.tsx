import type { Metadata } from "next";

import { TrustPage } from "../components/TrustPage";
import { ABOUT_PAGE_CONTENT } from "../lib/agent-content";

export const metadata: Metadata = {
  title: "About Side Glance",
  description: ABOUT_PAGE_CONTENT.description,
  alternates: {
    canonical: "/about",
    types: { "text/markdown": "/about.md" },
  },
};

export default function AboutPage() {
  return <TrustPage page={ABOUT_PAGE_CONTENT} />;
}
