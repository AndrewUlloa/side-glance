import {
  AGENT_DISCOVERY_CACHE_CONTROL,
  SIDE_GLANCE_API_CATALOG,
} from "../../lib/agent-discovery.ts";

export function GET() {
  return new Response(JSON.stringify(SIDE_GLANCE_API_CATALOG), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": AGENT_DISCOVERY_CACHE_CONTROL,
      "Content-Type":
        'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"; charset=utf-8',
    },
  });
}
