import {
  AGENT_DISCOVERY_CACHE_CONTROL,
  SIDE_GLANCE_SKILL_INDEX,
} from "../../../lib/agent-discovery.ts";

export function GET() {
  return Response.json(SIDE_GLANCE_SKILL_INDEX, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": AGENT_DISCOVERY_CACHE_CONTROL,
    },
  });
}
