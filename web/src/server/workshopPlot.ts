import { prisma } from "@/server/db";
import { GAME_RULES } from "@/server/gameRules";

export const MAX_WORKSHOPS_PER_USER = GAME_RULES.workshop.maxInstancesPerUser;

function needsPlotSlotReindex(rows: Array<{ plotSlot: number | null }>): boolean {
  if (rows.some((w) => w.plotSlot == null)) return true;
  const slots = rows.map((w) => w.plotSlot as number);
  return new Set(slots).size !== slots.length;
}

/**
 * 시설 목록 정리: 개수 상한 초과분 삭제(오래된 것부터), plotSlot은 표시 순서용 0..n-1로 재부여.
 * (DB 컬럼 plotSlot은 유지하되 부지 잠금은 사용하지 않음)
 */
export async function migrateUserWorkshopPlot(userId: string): Promise<void> {
  const max = MAX_WORKSHOPS_PER_USER;
  await prisma.$transaction(async (tx) => {
    const all = await tx.workshopInstance.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    if (all.length === 0) return;

    let keep = all;
    if (all.length > max) {
      const drop = all.slice(max);
      keep = all.slice(0, max);
      await tx.workshopInstance.deleteMany({
        where: { id: { in: drop.map((d) => d.id) } },
      });
    }

    if (needsPlotSlotReindex(keep)) {
      for (let i = 0; i < keep.length; i++) {
        await tx.workshopInstance.update({
          where: { id: keep[i]!.id },
          data: { plotSlot: i },
        });
      }
    }
  });
}

export async function installWorkshopForUser(input: {
  userId: string;
  workshopTypeId: string;
}): Promise<{ ok: true; workshopId: string } | { ok: false; error: string }> {
  const type = await prisma.workshopType.findUnique({
    where: { id: input.workshopTypeId },
  });
  if (!type) return { ok: false, error: "WORKSHOP_TYPE_NOT_FOUND" };

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) return { ok: false, error: "USER_NOT_FOUND" };

  try {
    const workshopId = await prisma.$transaction(async (tx): Promise<string> => {
      const list = await tx.workshopInstance.findMany({
        where: { userId: input.userId },
        orderBy: [{ plotSlot: "asc" }, { createdAt: "asc" }],
      });
      if (list.length >= MAX_WORKSHOPS_PER_USER) {
        throw new Error("WORKSHOP_CAP");
      }

      const nextSlot =
        list.length === 0 ? 0 : Math.max(...list.map((w) => (typeof w.plotSlot === "number" ? w.plotSlot : -1))) + 1;

      const created = await tx.workshopInstance.create({
        data: {
          userId: input.userId,
          workshopTypeId: input.workshopTypeId,
          plotSlot: nextSlot,
          minionCount: 0,
          lastCollectedAt: new Date(),
        },
      });
      return created.id;
    });
    return { ok: true, workshopId };
  } catch (e) {
    if (e instanceof Error && e.message === "WORKSHOP_CAP") return { ok: false, error: "PLOT_FULL" };
    return { ok: false, error: "TRANSACTION_FAILED" };
  }
}

export async function removeWorkshopFromPlot(input: {
  userId: string;
  workshopId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const w = await prisma.workshopInstance.findFirst({
    where: { id: input.workshopId, userId: input.userId },
  });
  if (!w) return { ok: false, error: "NOT_FOUND" };
  await prisma.workshopInstance.delete({ where: { id: w.id } });
  return { ok: true };
}
