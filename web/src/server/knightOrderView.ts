import type { KnightOrderBonuses } from "@/shared/knightOrder";
import type { KnightOrderView } from "@/shared/meDashboard";

export function knightOrderToView(bonuses: KnightOrderBonuses): KnightOrderView {
  return {
    totalLevel: bonuses.totalLevel,
    orderLevel: bonuses.orderLevel,
    minionCount: bonuses.minionCount,
    levelsToNextOrderLevel: bonuses.levelsToNextOrderLevel,
    atkPct: bonuses.atkPct,
    magicPct: bonuses.magicPct,
    finalDamagePct: bonuses.finalDamagePct,
    bossDamagePct: bonuses.bossDamagePct,
    partyPowerMult: bonuses.partyPowerMult,
  };
}
