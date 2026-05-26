import { z } from "zod";
import { prisma } from "@/server/db";
import { GAME_RULES } from "@/server/gameRules";
import { requireUserId } from "@/server/auth";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";
import { ensureWorkshopsForUser } from "@/server/ensureWorkshopsForUser";
import { workshopMasterySnapshot } from "@/server/workshopMastery";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ userId: url.searchParams.get("userId") ?? undefined });
    if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const auth = requireUserId(req, parsed.data.userId ?? null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });
    const userId = auth.userId;

    try {
      await ensureWorkshopsForUser(userId);
    } catch (e) {
      console.warn("[workshops/list] ensureWorkshopsForUser skipped:", e);
    }

    const workshops = await prisma.workshopInstance.findMany({
      where: { userId },
      include: {
        workshopType: true,
        _count: { select: { assignments: true } },
      },
      orderBy: [{ plotSlot: "asc" }, { createdAt: "asc" }],
      take: 100,
    });

    return Response.json({
      ok: true,
      tickSeconds: GAME_RULES.workshop.tickSeconds,
      workshopMaxCount: GAME_RULES.workshop.maxInstancesPerUser,
      workshops: workshops.map((w) => ({
        mastery: workshopMasterySnapshot(w.masteryXp),
        id: w.id,
        plotSlot: w.plotSlot ?? null,
        name: w.workshopType.name,
        kind: w.workshopType.kind,
        workshopTypeId: w.workshopTypeId,
        tier: Math.max(1, Math.min(5, Math.floor(w.tier ?? 1))),
        minionCount: Math.max(w.minionCount, w._count.assignments),
        assignedMinionCount: w._count.assignments,
        equippedToolItemId: w.equippedToolItemId,
        lastCollectedAt: w.lastCollectedAt,
        createdAt: w.createdAt,
        processCraftRecipeId: w.processCraftRecipeId,
        processCraftStartedAt: w.processCraftStartedAt,
        processCraftEndsAt: w.processCraftEndsAt,
        processCraftOutputMult: w.processCraftOutputMult,
        processCraftQuantity: w.processCraftQuantity,
      })),
    });
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    throw e;
  }
}
