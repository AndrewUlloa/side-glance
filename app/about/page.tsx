import { TrustPage } from "../components/TrustPage";
import { ABOUT_PAGE_CONTENT } from "../lib/agent-content";
import { buildPageMetadata } from "../lib/page-metadata";

export const metadata = buildPageMetadata({
  canonical: "/about",
  page: ABOUT_PAGE_CONTENT,
  title: "About Side Glance | Local-First Coding Agent Status",
});

export default function AboutPage() {
  return <TrustPage page={ABOUT_PAGE_CONTENT} />;
}
