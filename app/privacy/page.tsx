import { TrustPage } from "../components/TrustPage";
import { PRIVACY_PAGE_CONTENT } from "../lib/agent-content";
import { buildPageMetadata } from "../lib/page-metadata";

export const metadata = buildPageMetadata({
  canonical: "/privacy",
  page: PRIVACY_PAGE_CONTENT,
  title: "Side Glance Privacy | Website and Local CLI Data",
});

export default function PrivacyPage() {
  return <TrustPage page={PRIVACY_PAGE_CONTENT} />;
}
