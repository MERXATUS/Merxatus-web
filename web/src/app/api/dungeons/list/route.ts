import { loadDungeons, type DungeonDef } from "@/server/dungeonData";
import { attachDungeonStageMeta } from "@/shared/dungeonStageProgression";

export const runtime = "nodejs";

function slimDungeon(d: DungeonDef) {
  return {
    id: d.id,
    name: d.name,
    mode: d.mode,
    maxFloors: d.maxFloors,
    maxPartySize: d.maxPartySize,
    baseWaveSeconds: d.baseWaveSeconds,
    stage: attachDungeonStageMeta(d).stage,
  };
}

export async function GET(req: Request) {
  try {
    const lite = new URL(req.url).searchParams.get("lite") === "1";
    const { dungeons } = await loadDungeons();
    return Response.json({
      ok: true,
      dungeons: lite ? dungeons.map(slimDungeon) : dungeons.map((d) => attachDungeonStageMeta(d)),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

