export function GET() {
  return Response.json(
    {
      service: "side-glance-agent-discovery",
      status: "ok",
      authentication: "none",
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    }
  );
}
