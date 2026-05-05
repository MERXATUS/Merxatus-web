export const runtime = "nodejs";

export async function POST() {
  return Response.json(
    { ok: false, error: "MINION_BUY_REMOVED_USE_MARKET" },
    { status: 410 },
  );
}

