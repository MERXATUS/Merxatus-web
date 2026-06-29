import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { loadDungeons } from "@/server/dungeonData";
import { getIdleDungeonState } from "@/server/dungeonIdleRun";

export const runtime = "nodejs";

const QuerySchema = z.object({
  dungeonId: z.string().min(1),
  userId: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    dungeonId: url.searchParams.get("dungeonId") ?? undefined,
    userId: url.searchParams.get("userId") ?? undefined,
  });
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const { dungeons } = await loadDungeons();
    const dungeon = dungeons.find((d) => d.id === parsed.data.dungeonId);
    if (!dungeon) return Response.json({ ok: false, error: "DUNGEON_NOT_FOUND" }, { status: 404 });
    if (dungeon.mode !== "IDLE") {
      return Response.json({ ok: false, error: "NOT_IDLE_DUNGEON" }, { status: 400 });
    }

    const state = await getIdleDungeonState(auth.userId, dungeon);
    return Response.json(state);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
