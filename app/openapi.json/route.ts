import {
  AGENT_DISCOVERY_CACHE_CONTROL,
  SIDE_GLANCE_OPENAPI,
} from "../lib/agent-discovery.ts";

export function GET() {
  return new Response(JSON.stringify(SIDE_GLANCE_OPENAPI), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": AGENT_DISCOVERY_CACHE_CONTROL,
      "Content-Type":
        "application/vnd.oai.openapi+json;version=3.1; charset=utf-8",
    },
  });
}
