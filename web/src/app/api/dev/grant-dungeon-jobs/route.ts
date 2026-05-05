import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";

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

  const userId = auth.userId;

  try {
    const out = await prisma.$transaction(async (tx) => {
      const MAX_OWNED = 10;

      const existingCount = await tx.minion.count({ where: { userId } });
      const canCreate = Math.max(0, MAX_OWNED - existingCount);

      // Prefer reusing existing minions (so we don't exceed MAX and get auto-trimmed).
      // Choose ones not assigned to workshop.
      const reusable = await tx.minion.findMany({
        where: { userId, workshopAssignments: { none: {} } },
        select: { id: true },
        orderBy: [{ createdAt: "asc" }],
        take: 3,
      });

      const ids: string[] = [];
      const jobs = ["WARRIOR", "ARCHER", "MAGE"] as const;
      for (let i = 0; i < reusable.length; i++) {
        const id = reusable[i]!.id;
        await tx.minion.update({ where: { id }, data: { jobType: jobs[i] } });
        ids.push(id);
      }

      // If we couldn't reuse enough, create the rest (but never exceed MAX).
      const need = Math.max(0, 3 - ids.length);
      const createN = Math.min(need, canCreate);
      for (let i = 0; i < createN; i++) {
        const m = await tx.minion.create({ data: { userId, jobType: jobs[ids.length]!, grade: "D", level: 1 } });
        ids.push(m.id);
      }

      // Make sure owned >= actual minion count (clamped) so ensure() won't delete our picks.
      const countAfter = await tx.minion.count({ where: { userId } });
      await tx.minionInventory.upsert({
        where: { userId },
        create: { userId, owned: Math.min(MAX_OWNED, Math.max(1, countAfter)) },
        update: { owned: Math.min(MAX_OWNED, Math.max(1, countAfter)) },
      });

      return { created: createN, reused: reusable.length, minionIds: ids };
    });

    return Response.json({ ok: true, created: out.created, reused: out.reused, minionIds: out.minionIds });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

