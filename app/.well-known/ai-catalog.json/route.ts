import {
  AGENT_DISCOVERY_CACHE_CONTROL,
  SIDE_GLANCE_ARD_CATALOG,
} from "../../lib/agent-discovery.ts";

export function GET() {
  return Response.json(SIDE_GLANCE_ARD_CATALOG, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": AGENT_DISCOVERY_CACHE_CONTROL,
    },
  });
}
