import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { createPushLuckDungeonRun } from "@/server/dungeonRun";
import { loadDungeons } from "@/server/dungeonData";

export const runtime = "nodejs";

const BodySchema = z.object({
  dungeonId: z.string().min(1),
  minionIds: z.array(z.string().min(1)).min(1).max(10),
  userId: z.string().min(1).optional(),
});

/** PUSH_LUCK 던전 런만 생성 — 1층 전투는 `/api/dungeons/run/advance` */
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
    if (dungeon.mode !== "PUSH_LUCK") {
      if (dungeon.mode === "IDLE") {
        return Response.json({ ok: false, error: "USE_IDLE_API" }, { status: 400 });
      }
      return Response.json({ ok: false, error: "NOT_PUSH_LUCK_DUNGEON" }, { status: 400 });
    }

    const created = await createPushLuckDungeonRun({
      userId: auth.userId,
      dungeon,
      minionIds: parsed.data.minionIds,
    });
    if (!created.ok) {
      const err = created.error;
      const status =
        err === "MINION_NOT_FOUND" ||
        err === "PARTY_TOO_LARGE" ||
        err.startsWith("DUNGEON_PARTY_LEVEL_TOO_LOW:") ||
        err.startsWith("DUNGEON_PARTY_POWER_TOO_LOW:")
          ? 400
          : 400;
      return Response.json({ ok: false, error: err }, { status });
    }
    return Response.json({ ok: true, runId: created.runId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
