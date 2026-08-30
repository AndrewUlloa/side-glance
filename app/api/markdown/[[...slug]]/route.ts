import {
  MARKDOWN_NOT_FOUND,
  pageContentForPath,
  renderPageMarkdown,
} from "../../../lib/agent-content.ts";
import { SIDE_GLANCE_SITE_URL } from "../../../lib/site-identity.ts";

const responseHeaders = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
  "Content-Language": "en",
  "Content-Type": "text/markdown; charset=utf-8",
  Vary: "Accept",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug?: string[] }> }
) {
  const { slug = [] } = await context.params;
  const path = slug.length === 0 ? "/" : `/${slug.join("/")}`;
  const page = pageContentForPath(path);

  if (!page) {
    return new Response(MARKDOWN_NOT_FOUND, {
      status: 404,
      headers: responseHeaders,
    });
  }

  return new Response(`${renderPageMarkdown(page)}\n`, {
    headers: {
      ...responseHeaders,
      Link: `<${SIDE_GLANCE_SITE_URL}${page.path === "/" ? "" : page.path}>; rel="canonical", <${SIDE_GLANCE_SITE_URL}${page.markdownPath}>; rel="alternate"; type="text/markdown", <${SIDE_GLANCE_SITE_URL}/llms.txt>; rel="describedby"`,
    },
  });
}
