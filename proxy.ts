import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  appendVary,
  markdownAlternateFor,
  preferredRepresentation,
} from "./app/lib/content-negotiation";

const isExplicitMarkdownPath = (pathname: string) => pathname.endsWith(".md");

const isPageLikePath = (pathname: string) => {
  const finalSegment = pathname.split("/").at(-1) ?? "";
  return !finalSegment.includes(".") || isExplicitMarkdownPath(pathname);
};

const addRepresentationHeaders = (
  response: NextResponse,
  pathname: string
) => {
  response.headers.set(
    "Vary",
    appendVary(response.headers.get("Vary"), "Accept")
  );

  const alternate = markdownAlternateFor(pathname);
  if (alternate) {
    response.headers.set(
      "Link",
      `<${alternate}>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"`
    );
  }
  return response;
};

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/.well-known/") || pathname === "/auth.md") {
    return NextResponse.next();
  }
  if (!isPageLikePath(pathname)) {
    return NextResponse.next();
  }

  if (isExplicitMarkdownPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = `/api/markdown${pathname.slice(0, -3)}`;
    return addRepresentationHeaders(NextResponse.rewrite(url), pathname);
  }

  const accept = request.headers.get("accept");
  const representation = preferredRepresentation(accept);

  if (representation === "text/markdown") {
    const url = request.nextUrl.clone();
    url.pathname = `/api/markdown${pathname}`;
    return addRepresentationHeaders(NextResponse.rewrite(url), pathname);
  }

  if (representation === null && accept) {
    return new NextResponse(
      "Not Acceptable\n\nAvailable representations: text/html, text/markdown\n",
      {
        status: 406,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          Vary: "Accept",
        },
      }
    );
  }

  return addRepresentationHeaders(NextResponse.next(), pathname);
}

export const config = {
  matcher: ["/((?!api/|_next/|_vercel/).*)"],
};
