import type { MetadataRoute } from "next";

import { SITE_PAGE_CONTENT } from "./lib/agent-content.ts";
import { SIDE_GLANCE_SITE_URL } from "./lib/site-identity.ts";

export default function sitemap(): MetadataRoute.Sitemap {
  return SITE_PAGE_CONTENT.map((page) => ({
    url: `${SIDE_GLANCE_SITE_URL}${page.path === "/" ? "" : page.path}`,
    changeFrequency: page.path === "/" ? "weekly" : "monthly",
    priority: page.path === "/" ? 1 : 0.7,
  }));
}
