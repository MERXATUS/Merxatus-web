import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { loadDungeons } from "@/server/dungeonData";
import { DUNGEON_JOB_TYPES } from "@/server/minionJobs";
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
  if (!auth.ok)
    return Response.json({ ok: false, error: auth.error }, { status: 401 });

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
      // stop existing running run (single active run per user)
      await tx.dungeonRun.updateMany({
        where: { userId: auth.userId, status: "RUNNING" },
        data: { status: "STOPPED" },
      });

      const minions = await tx.minion.findMany({
        where: { id: { in: ids } },
        select: { id: true, userId: true, jobType: true },
        take: 20,
      });
      if (minions.length !== ids.length) {
        const found = new Set(minions.map((m) => m.id));
        const missing = ids.filter((id) => !found.has(id));
        return { ok: false as const, error: "MINION_NOT_FOUND" as const, missing };
      }

      for (const m of minions) {
        if (!DUNGEON_JOB_TYPES.has(m.jobType)) throw new Error("INVALID_DUNGEON_JOB");
      }

      const workshopBusy = await tx.workshopAssignment.findFirst({
        where: { minionId: { in: ids } },
        select: { minionId: true },
      });
      if (workshopBusy) throw new Error("MINION_ASSIGNED_TO_WORKSHOP");

      // Own minions + contracted foreign minions (party rules)
      const mine = new Set(minions.filter((m) => m.userId === auth.userId).map((m) => m.id));
      const foreign = ids.filter((id) => !mine.has(id));
      if (foreign.length > 0) {
        const contracts = await tx.minionContract.findMany({
          where: {
            hirerUserId: auth.userId,
            status: "ACTIVE",
            scope: "DUNGEON_RUN_1",
            minionId: { in: foreign },
          },
          select: { id: true, minionId: true },
          take: 20,
        });
        const byMinion = new Map(contracts.map((c) => [c.minionId, c.id]));
        for (const id of foreign) {
          const cid = byMinion.get(id);
          if (!cid) throw new Error("MINION_NOT_OWNED_OR_CONTRACT");
          await tx.minionContract.update({
            where: { id: cid },
            data: { status: "USED", usedAt: new Date() },
          });
        }
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

    if ((run as any)?.ok === false) return Response.json(run, { status: 400 });
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

