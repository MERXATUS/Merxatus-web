import { prisma } from "@/server/db";
import { GAME_RULES } from "@/server/gameRules";

export const PLOT_MAX_SLOTS = GAME_RULES.plot.maxSlots;

/** 다음 부지 칸을 열 때 필요한 골드. 이미 최대면 null */
export function goldForNextPlotUnlock(plotSlotsUnlocked: number): number | null {
  const max = PLOT_MAX_SLOTS;
  if (plotSlotsUnlocked >= max) return null;
  const idx = plotSlotsUnlocked - 1;
  const arr = GAME_RULES.plot.unlockGoldAfterSlotCount;
  const g = arr[idx];
  return typeof g === "number" ? g : null;
}

function plotNeedsMigration(
  rows: Array<{ plotSlot: number | null }>,
): boolean {
  const max = PLOT_MAX_SLOTS;
  if (rows.length > max) return true;
  if (rows.some((w) => w.plotSlot == null)) return true;
  const slots = rows.map((w) => w.plotSlot as number);
  if (new Set(slots).size !== slots.length) return true;
  if (slots.some((s) => s < 0 || s >= max)) return true;
  return false;
}

/**
 * 레거시(슬롯 없음·중복·칸 수 초과) 데이터를 부지 규칙에 맞게 정리합니다.
 * - 최대 maxSlots개만 유지(생성 순 앞선 것), 나머지 삭제
 * - 슬롯이 비어 있으면 0부터 순서대로 부여
 * - 사용 중인 최대 슬롯에 맞춰 plotSlotsUnlocked 보정(레거시 유저 박탈 방지)
 */
export async function migrateUserWorkshopPlot(userId: string): Promise<void> {
  const max = PLOT_MAX_SLOTS;
  await prisma.$transaction(async (tx) => {
    const all = await tx.workshopInstance.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    if (all.length === 0) return;

    let keep = all;
    let dropped = false;
    if (plotNeedsMigration(all)) {
      keep = all.slice(0, max);
      const drop = all.slice(max);
      if (drop.length) {
        dropped = true;
        await tx.workshopInstance.deleteMany({
          where: { id: { in: drop.map((d) => d.id) } },
        });
      }
      for (let i = 0; i < keep.length; i++) {
        await tx.workshopInstance.update({
          where: { id: keep[i].id },
          data: { plotSlot: i },
        });
      }
    }

    const maxUsedSlot = keep.reduce((m, w) => Math.max(m, w.plotSlot ?? 0), 0);
    const neededUnlock = Math.min(max, Math.max(1, maxUsedSlot + 1));

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { plotSlotsUnlocked: true },
    });
    if (!user) return;

    if (neededUnlock > user.plotSlotsUnlocked || dropped) {
      await tx.user.update({
        where: { id: userId },
        data: { plotSlotsUnlocked: Math.min(max, Math.max(user.plotSlotsUnlocked, neededUnlock)) },
      });
    }
  });
}

export async function unlockNextPlotSlot(userId: string): Promise<
  { ok: true; plotSlotsUnlocked: number } | { ok: false; error: string }
> {
  const max = PLOT_MAX_SLOTS;
  try {
    type TxOk = { plotSlotsUnlocked: number };
    type TxErr = { err: string };
    const out = await prisma.$transaction(async (tx): Promise<TxOk | TxErr> => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { plotSlotsUnlocked: true },
      });
      if (!user) return { err: "USER_NOT_FOUND" };
      if (user.plotSlotsUnlocked >= max) return { err: "PLOT_FULLY_UNLOCKED" };

      const cost = goldForNextPlotUnlock(user.plotSlotsUnlocked);
      if (cost == null || cost <= 0) return { err: "INVALID_UNLOCK_STATE" };

      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) return { err: "WALLET_NOT_FOUND" };
      if (wallet.goldAvailable < cost) return { err: "INSUFFICIENT_GOLD" };

      await tx.wallet.update({
        where: { userId },
        data: { goldAvailable: { decrement: cost } },
      });

      const next = user.plotSlotsUnlocked + 1;
      await tx.user.update({
        where: { id: userId },
        data: { plotSlotsUnlocked: next },
      });

      return { plotSlotsUnlocked: next };
    });

    if ("err" in out) return { ok: false, error: out.err };
    return { ok: true, plotSlotsUnlocked: out.plotSlotsUnlocked };
  } catch {
    return { ok: false, error: "TRANSACTION_FAILED" };
  }
}

export async function installWorkshopOnPlot(input: {
  userId: string;
  plotSlot: number;
  workshopTypeId: string;
}): Promise<{ ok: true; workshopId: string } | { ok: false; error: string }> {
  const max = PLOT_MAX_SLOTS;
  if (!Number.isFinite(input.plotSlot) || input.plotSlot < 0 || input.plotSlot >= max) {
    return { ok: false, error: "INVALID_SLOT" };
  }

  const type = await prisma.workshopType.findUnique({
    where: { id: input.workshopTypeId },
  });
  if (!type) return { ok: false, error: "WORKSHOP_TYPE_NOT_FOUND" };

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { plotSlotsUnlocked: true },
  });
  if (!user) return { ok: false, error: "USER_NOT_FOUND" };
  if (input.plotSlot >= user.plotSlotsUnlocked) {
    return { ok: false, error: "PLOT_LOCKED" };
  }

  const occupied = await prisma.workshopInstance.findFirst({
    where: { userId: input.userId, plotSlot: input.plotSlot },
  });
  if (occupied) return { ok: false, error: "SLOT_OCCUPIED" };

  const count = await prisma.workshopInstance.count({
    where: { userId: input.userId },
  });
  if (count >= max) return { ok: false, error: "PLOT_FULL" };

  try {
    const workshopId = await prisma.$transaction(async (tx) => {
      const created = await tx.workshopInstance.create({
        data: {
          userId: input.userId,
          workshopTypeId: input.workshopTypeId,
          plotSlot: input.plotSlot,
          minionCount: 0,
          lastCollectedAt: new Date(),
        },
      });
      return created.id;
    });

    return { ok: true, workshopId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "UNKNOWN";
    if (msg === "WALLET_NOT_FOUND" || msg === "INSUFFICIENT_GOLD") {
      return { ok: false, error: msg };
    }
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
