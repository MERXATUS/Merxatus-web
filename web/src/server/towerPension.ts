import { prisma } from "@/server/db";
import { loadTowerConfig } from "@/server/towerData";
import {
  towerDailyPensionGold,
  towerPensionDayKey,
  towerWeekKey,
} from "@/shared/towerPension";

export async function syncTowerPensionFloor(userId: string, reachedFloor: number) {
  const floor = Math.max(0, Math.floor(reachedFloor));
  if (floor <= 0) return;

  const weekKey = towerWeekKey();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { towerPensionWeekKey: true, towerPensionFloor: true },
  });
  if (!user) return;

  const sameWeek = user.towerPensionWeekKey === weekKey;
  const current = sameWeek ? user.towerPensionFloor : 0;
  if (floor <= current) return;

  await prisma.user.update({
    where: { id: userId },
    data: {
      towerPensionWeekKey: weekKey,
      towerPensionFloor: floor,
    },
  });
}

export async function getTowerPensionState(userId: string) {
  const config = await loadTowerConfig();
  const weekKey = towerWeekKey();
  const dayKey = towerPensionDayKey();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      towerPensionWeekKey: true,
      towerPensionFloor: true,
      towerLastPensionClaimDay: true,
    },
  });
  if (!user) throw new Error("USER_NOT_FOUND");

  const pensionFloor = user.towerPensionWeekKey === weekKey ? user.towerPensionFloor : 0;
  const dailyGold = towerDailyPensionGold(pensionFloor);
  const alreadyClaimedToday = user.towerLastPensionClaimDay === dayKey;

  return {
    ok: true as const,
    weekKey,
    dayKey,
    towerName: config.name,
    pensionFloor,
    dailyGold,
    canClaimToday: pensionFloor > 0 && !alreadyClaimedToday,
    alreadyClaimedToday,
  };
}

export async function claimTowerDailyPension(userId: string) {
  const state = await getTowerPensionState(userId);
  if (!state.canClaimToday) throw new Error("TOWER_PENSION_NOT_AVAILABLE");

  const dayKey = towerPensionDayKey();
  const gold = state.dailyGold;

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { towerLastPensionClaimDay: true },
    });
    if (!user || user.towerLastPensionClaimDay === dayKey) {
      throw new Error("TOWER_PENSION_ALREADY_CLAIMED");
    }

    await tx.user.update({
      where: { id: userId },
      data: { towerLastPensionClaimDay: dayKey },
    });

    await tx.wallet.upsert({
      where: { userId },
      create: { userId, goldAvailable: gold, goldLocked: 0 },
      update: { goldAvailable: { increment: gold } },
    });
  });

  return { ok: true as const, goldGained: gold, dayKey };
}
