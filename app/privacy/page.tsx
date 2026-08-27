import type { Metadata } from "next";

import { TrustPage } from "../components/TrustPage";
import { PRIVACY_PAGE_CONTENT } from "../lib/agent-content";

export const metadata: Metadata = {
  title: "Privacy — Side Glance",
  description: PRIVACY_PAGE_CONTENT.description,
  alternates: {
    canonical: "/privacy",
    types: { "text/markdown": "/privacy.md" },
  },
};

export default function PrivacyPage() {
  return <TrustPage page={PRIVACY_PAGE_CONTENT} />;
}
