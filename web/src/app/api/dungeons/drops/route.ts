import { loadDungeons } from "@/server/dungeonData";
import { loadAllDungeonDropTables } from "@/server/dungeonDropTablePayload";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const dungeonId = new URL(req.url).searchParams.get("dungeonId")?.trim();
    if (!dungeonId) {
      return Response.json({ ok: false, error: "MISSING_DUNGEON_ID" }, { status: 400 });
    }

    const [{ dungeons }, dropTables] = await Promise.all([loadDungeons(), loadAllDungeonDropTables()]);
    const payload = dropTables[dungeonId];
    if (!payload) {
      const exists = dungeons.some((d) => d.id === dungeonId);
      if (!exists) {
        return Response.json({ ok: false, error: "DUNGEON_NOT_FOUND" }, { status: 404 });
      }
      return Response.json({ ok: false, error: "DROP_TABLE_EMPTY" }, { status: 404 });
    }

    return Response.json({ ok: true, ...payload });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
