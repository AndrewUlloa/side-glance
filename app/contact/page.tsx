import { TrustPage } from "../components/TrustPage";
import { CONTACT_PAGE_CONTENT } from "../lib/agent-content";
import { buildPageMetadata } from "../lib/page-metadata";

export const metadata = buildPageMetadata({
  canonical: "/contact",
  page: CONTACT_PAGE_CONTENT,
  title: "Side Glance Support & Contact",
});

export default function ContactPage() {
  return <TrustPage page={CONTACT_PAGE_CONTENT} />;
}
