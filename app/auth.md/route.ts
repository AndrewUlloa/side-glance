import {
  AGENT_DISCOVERY_CACHE_CONTROL,
  SIDE_GLANCE_AUTH_MARKDOWN,
} from "../lib/agent-discovery.ts";

export function GET() {
  return new Response(SIDE_GLANCE_AUTH_MARKDOWN, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": AGENT_DISCOVERY_CACHE_CONTROL,
      "Content-Language": "en",
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
