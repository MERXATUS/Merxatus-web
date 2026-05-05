import { z } from "zod";
import { prisma } from "@/server/db";
import { GAME_RULES } from "@/server/gameRules";
import { requireUserId } from "@/server/auth";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";
import { ensureWorkshopsForUser } from "@/server/ensureWorkshopsForUser";
import { goldForNextPlotUnlock } from "@/server/workshopPlot";
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

    // 처음 로그인한 유저는 시설(WorkshopInstance)이 없을 수 있음 — 부지에서 설치
    await ensureWorkshopsForUser(userId);

    const userRow = await prisma.user.findUnique({
      where: { id: userId },
      select: { plotSlotsUnlocked: true },
    });
    const plotSlotsUnlocked = Math.max(
      1,
      Math.min(GAME_RULES.plot.maxSlots, Math.floor(userRow?.plotSlotsUnlocked ?? 1)),
    );

    const workshops = await prisma.workshopInstance.findMany({
      where: { userId },
      include: { workshopType: true },
      orderBy: [{ plotSlot: "asc" }, { createdAt: "asc" }],
      take: 100,
    });

    return Response.json({
      ok: true,
      tickSeconds: GAME_RULES.workshop.tickSeconds,
      plotMaxSlots: GAME_RULES.plot.maxSlots,
      plotSlotsUnlocked,
      nextUnlockGold: goldForNextPlotUnlock(plotSlotsUnlocked),
      workshops: workshops.map((w) => ({
        mastery: workshopMasterySnapshot(w.masteryXp),
        id: w.id,
        plotSlot: w.plotSlot ?? null,
        name: w.workshopType.name,
        kind: w.workshopType.kind,
        workshopTypeId: w.workshopTypeId,
        tier: Math.max(1, Math.min(5, Math.floor(w.tier ?? 1))),
        minionCount: w.minionCount,
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

