import type { MinionCombatBreakdown } from "@/shared/minionCombatStats";
import type { MinionEquipmentSource } from "@/shared/minionEquipmentView";

export type MeDashboardGoldDay = {
  date: string;
  label: string;
  netGold: number;
};

export type MeDashboardGoldTrend = {
  week: MeDashboardGoldDay[];
  weekNetGold: number;
  month: MeDashboardGoldDay[];
  monthNetGold: number;
};

export type MeDashboardPendingSale = {
  listingId: string;
  itemId: string;
  itemName: string;
  quantity: number;
  highestBid: number;
  expectedNetGold: number;
  endsAt: string | null;
  enhanceLevel: number | null;
};

/** @deprecated use MeDashboardPendingSale */
export type MeDashboardRecentSale = MeDashboardPendingSale;

export type MeDashboardStrongestMinion = {
  id: string;
  combatClassLabel: string;
  level: number;
  equippedWeapon: MinionEquipmentSource["equippedWeapon"];
  equippedArmor: MinionEquipmentSource["equippedArmor"];
  combatStats: MinionCombatBreakdown;
  traits: Array<{ type: string; rank: number }>;
};

export type MeDashboard = {
  ok: true;
  assets: {
    goldAvailable: number;
    goldLocked: number;
    inventoryEstimatedGold: number;
    weaponsEstimatedGold: number;
    totalEstimatedGold: number;
    inventoryKindCount: number;
    inventoryTotalQty: number;
    weaponCount: number;
  };
  goldTrend: MeDashboardGoldTrend;
  pendingSales: MeDashboardPendingSale[];
  strongestMinion: MeDashboardStrongestMinion | null;
};

/** @deprecated use MeDashboardGoldDay */
export type MeDashboardWeeklyDay = MeDashboardGoldDay;
