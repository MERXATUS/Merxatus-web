import { prisma } from "@/server/db";
import {
  aggregateSetCodexBuffs,
  buildCodexRegisteredKeySet,
  codexEligibleSets,
  computeSetCodexProgress,
  isSetCodexTierUnlocked,
  setCodexItemIds,
  setCodexTierBuff,
  SET_CODEX_TIERS,
  type SetCodexBuffSlice,
} from "@/shared/equipmentSetCodex";
import type { SetCodexEntryView, SetCodexTierView } from "@/shared/equipmentSetCodexViews";

export type { SetCodexEntryView, SetCodexTierView };

export async function loadSetCodexTotals(userId: string): Promise<SetCodexBuffSlice> {
  const payload = await loadSetCodexPayload(userId);
  return payload.totals;
}

export async function loadSetCodexPayload(userId: string) {
  const [weaponEntries, armorEntries] = await Promise.all([
    prisma.weaponCodexEntry.findMany({
      where: { userId },
      select: { baseItemId: true, milestoneId: true },
    }),
    prisma.armorCodexEntry.findMany({
      where: { userId },
      select: { baseItemId: true, milestoneId: true },
    }),
  ]);

  const registeredKeys = buildCodexRegisteredKeySet([...weaponEntries, ...armorEntries]);
  const unlockedBuffSlices: SetCodexBuffSlice[] = [];

  const catalog: SetCodexEntryView[] = codexEligibleSets().map((set) => {
    const progress = computeSetCodexProgress(set, registeredKeys);
    const tiers: SetCodexTierView[] = SET_CODEX_TIERS.map((tier) => {
      const unlocked = isSetCodexTierUnlocked(set, registeredKeys, tier);
      const buff = setCodexTierBuff(set, tier);
      if (unlocked) unlockedBuffSlices.push(buff);
      return {
        tierId: tier.id,
        label: tier.label,
        description: tier.description,
        unlocked,
        buff,
      };
    });
    const setBuffSlices = tiers.filter((t) => t.unlocked).map((t) => t.buff);
    const buff = setBuffSlices.reduce(
      (acc, s) => ({
        bonusPower: acc.bonusPower + s.bonusPower,
        bonusAtkMilli: acc.bonusAtkMilli + s.bonusAtkMilli,
        bonusMagicMilli: acc.bonusMagicMilli + s.bonusMagicMilli,
        bonusHpMilli: acc.bonusHpMilli + s.bonusHpMilli,
        bonusDefMilli: acc.bonusDefMilli + s.bonusDefMilli,
      }),
      {
        bonusPower: 0,
        bonusAtkMilli: 0,
        bonusMagicMilli: 0,
        bonusHpMilli: 0,
        bonusDefMilli: 0,
      },
    );
    return {
      setId: set.id,
      name: set.name,
      grade: set.grade,
      realm: set.realm,
      tagline: set.tagline,
      itemCount: setCodexItemIds(set).length,
      registeredSlots: progress.registeredSlots,
      totalSlots: progress.totalSlots,
      completionPct: progress.completionPct,
      allBaseRegistered: progress.allBaseRegistered,
      tiers,
      buff,
      unlockedTierCount: tiers.filter((t) => t.unlocked).length,
    };
  });

  const totals = aggregateSetCodexBuffs(unlockedBuffSlices);
  return { catalog, totals };
}
