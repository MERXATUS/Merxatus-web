import { loadDungeons } from "@/server/dungeonData";
import { attachDungeonStageMeta } from "@/shared/dungeonStageProgression";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { dungeons } = await loadDungeons();
    return Response.json({
      ok: true,
      dungeons: dungeons.map((d) => attachDungeonStageMeta(d)),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

