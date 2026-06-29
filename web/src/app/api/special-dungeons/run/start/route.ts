import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { createPushLuckDungeonRun } from "@/server/dungeonRun";
import { findPushLuckDungeonById } from "@/server/specialDungeonData";

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
    const dungeon = await findPushLuckDungeonById(parsed.data.dungeonId);
    if (!dungeon) return Response.json({ ok: false, error: "SPECIAL_DUNGEON_NOT_FOUND" }, { status: 404 });

    const created = await createPushLuckDungeonRun({
      userId: auth.userId,
      dungeon,
      minionIds: parsed.data.minionIds,
    });
    if (!created.ok) {
      return Response.json({ ok: false, error: created.error }, { status: 400 });
    }
    return Response.json({ ok: true, runId: created.runId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
