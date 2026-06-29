import { loadTowerDropTable } from "@/server/towerDropTablePayload";

export const runtime = "nodejs";

export async function GET() {
  try {
    const payload = await loadTowerDropTable();
    return Response.json({ ok: true, ...payload });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
