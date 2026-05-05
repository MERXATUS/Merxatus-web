import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { loadDungeons } from "@/server/dungeonData";
import { advancePushLuckFloor } from "@/server/dungeonRun";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const run = await prisma.dungeonRun.findFirst({
      where: { userId: auth.userId, status: "RUNNING" },
      orderBy: { startedAt: "desc" },
    });
    if (!run) return Response.json({ ok: false, error: "NO_ACTIVE_RUN" }, { status: 400 });

    const { dungeons } = await loadDungeons();
    const dungeon = dungeons.find((d) => d.id === run.dungeonId);
    if (!dungeon) return Response.json({ ok: false, error: "DUNGEON_DEF_MISSING" }, { status: 500 });
    if (dungeon.mode !== "PUSH_LUCK") return Response.json({ ok: false, error: "NOT_PUSH_LUCK_DUNGEON" }, { status: 400 });

    const out = await advancePushLuckFloor({ userId: auth.userId, dungeon });
    return Response.json(out);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

