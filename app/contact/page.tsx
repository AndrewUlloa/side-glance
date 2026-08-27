import type { Metadata } from "next";

import { TrustPage } from "../components/TrustPage";
import { CONTACT_PAGE_CONTENT } from "../lib/agent-content";

export const metadata: Metadata = {
  title: "Contact and support — Side Glance",
  description: CONTACT_PAGE_CONTENT.description,
  alternates: {
    canonical: "/contact",
    types: { "text/markdown": "/contact.md" },
  },
};

export default function ContactPage() {
  return <TrustPage page={CONTACT_PAGE_CONTENT} />;
}
