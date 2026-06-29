import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { loadDungeons } from "@/server/dungeonData";
import { createIdleDungeonRun } from "@/server/dungeonIdleRun";

export const runtime = "nodejs";

const BodySchema = z.object({
  dungeonId: z.string().min(1),
  minionIds: z.array(z.string().min(1)).min(1).max(10),
  userId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
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

    const created = await createIdleDungeonRun({
      userId: auth.userId,
      dungeon,
      minionIds: parsed.data.minionIds,
    });
    return Response.json(created);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
