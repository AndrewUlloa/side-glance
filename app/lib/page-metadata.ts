import type { Metadata } from "next";

import type { SitePageContent } from "./agent-content.ts";
import { SITE_ASSETS } from "./site-assets.ts";
import { SIDE_GLANCE_SITE_URL } from "./site-identity.ts";

interface PageMetadataOptions {
  canonical: string;
  page: SitePageContent;
  title: string;
}

export function buildPageMetadata({
  canonical,
  page,
  title,
}: PageMetadataOptions): Metadata {
  const url = `${SIDE_GLANCE_SITE_URL}${canonical}`;
  const image = {
    alt: "Side Glance — Long loops. Short glances.",
    height: 630,
    type: "image/png",
    url: SITE_ASSETS.openGraph,
    width: 1200,
  } as const;

  return {
    title,
    description: page.description,
    alternates: {
      canonical,
      types: { "text/markdown": page.markdownPath },
    },
    openGraph: {
      type: "website",
      title,
      description: page.description,
      siteName: "Side Glance",
      url,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: page.description,
      images: [image],
    },
  };
}
