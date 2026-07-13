export const dynamic = "force-static";

export function GET() {
  return Response.json({
    ok: true,
    service: "qbo-xero-migrator-web",
  });
}
