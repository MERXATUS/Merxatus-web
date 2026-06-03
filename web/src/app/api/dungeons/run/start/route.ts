import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { loadDungeons } from "@/server/dungeonData";
import { initializeDungeonRunPartyHp } from "@/server/dungeonRun";

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

  const { dungeonId, minionIds } = parsed.data;
  const ids = Array.from(new Set(minionIds.map((x) => String(x).trim()).filter((x) => x.length > 0)));

  try {
    const { dungeons } = await loadDungeons();
    const def = dungeons.find((d) => d.id === dungeonId);
    if (!def) return Response.json({ ok: false, error: "DUNGEON_NOT_FOUND" }, { status: 404 });

    const maxParty = def.maxPartySize ?? 1;
    if (ids.length > maxParty) {
      return Response.json({ ok: false, error: "PARTY_TOO_LARGE" }, { status: 400 });
    }

    const run = await prisma.$transaction(async (tx) => {
      await tx.dungeonRun.updateMany({
        where: { userId: auth.userId, status: "RUNNING" },
        data: { status: "STOPPED" },
      });

      const minions = await tx.minion.findMany({
        where: { id: { in: ids }, userId: auth.userId },
        select: { id: true },
        take: 20,
      });
      if (minions.length !== ids.length) {
        return { ok: false as const, error: "MINION_NOT_FOUND" as const };
      }

      const created = await tx.dungeonRun.create({
        data: {
          userId: auth.userId,
          dungeonId,
          status: "RUNNING",
          startedAt: new Date(),
          lastTickAt: new Date(),
          party: {
            create: ids.map((id) => ({ minionId: id })),
          },
        },
        include: { party: true },
      });
      return created;
    });

    if ((run as { ok?: boolean })?.ok === false) return Response.json(run, { status: 400 });
    const runId = (run as { id: string }).id;
    if (def.mode === "PUSH_LUCK") {
      await initializeDungeonRunPartyHp(auth.userId, runId);
    }
    return Response.json({ ok: true, runId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
