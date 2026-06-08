import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { createAutoExploreRun } from "@/server/autoExploreRun";
import { attachDungeonStageMeta } from "@/shared/dungeonStageProgression";

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

  const out = await createAutoExploreRun({
    userId: auth.userId,
    dungeonId: parsed.data.dungeonId,
    minionIds: parsed.data.minionIds,
  });

  if (!out.ok) {
    const status =
      out.error === "DUNGEON_NOT_FOUND"
        ? 404
        : out.error === "DAILY_WAVE_CAP_REACHED"
          ? 429
          : 400;
    return Response.json({ ok: false, error: out.error }, { status });
  }

  return Response.json({
    ok: true,
    runId: out.runId,
    dungeon: attachDungeonStageMeta(out.dungeon),
  });
}
