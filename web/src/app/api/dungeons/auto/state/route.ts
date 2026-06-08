import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { getAutoExploreState } from "@/server/autoExploreRun";
import { attachDungeonStageMeta } from "@/shared/dungeonStageProgression";
import { loadDungeons } from "@/server/dungeonData";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ userId: url.searchParams.get("userId") ?? undefined });
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const state = await getAutoExploreState(auth.userId);
    if (!state.active) return Response.json(state);

    const { dungeons } = await loadDungeons();
    const full = dungeons.find((d) => d.id === state.dungeon.id);
    const dungeon = full ? attachDungeonStageMeta(full) : state.dungeon;

    return Response.json({ ...state, dungeon });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
