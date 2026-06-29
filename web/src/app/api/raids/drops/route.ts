import { loadAllRaidDropTables } from "@/server/raidDropTablePayload";
import { loadRaids } from "@/server/raidData";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const raidId = new URL(req.url).searchParams.get("raidId")?.trim();
    if (!raidId) {
      return Response.json({ ok: false, error: "MISSING_RAID_ID" }, { status: 400 });
    }

    const [{ raids }, dropTables] = await Promise.all([loadRaids(), loadAllRaidDropTables()]);
    const payload = dropTables[raidId];
    if (!payload) {
      const exists = raids.some((r) => r.id === raidId);
      if (!exists) {
        return Response.json({ ok: false, error: "RAID_NOT_FOUND" }, { status: 404 });
      }
      return Response.json({ ok: false, error: "DROP_TABLE_EMPTY" }, { status: 404 });
    }

    return Response.json({ ok: true, ...payload });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
