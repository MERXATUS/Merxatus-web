import type { MinionCombatBreakdown } from "@/shared/minionCombatStats";
import type { MinionEquipmentSource } from "@/shared/minionEquipmentView";
import type { MinionSkillView } from "@/shared/minionSkills";

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

export type KnightOrderView = {
  totalLevel: number;
  orderLevel: number;
  minionCount: number;
  levelsToNextOrderLevel: number;
  atkPct: number;
  magicPct: number;
  finalDamagePct: number;
  bossDamagePct: number;
  partyPowerMult: number;
};

export type MeDashboardRepresentativeMinion = {
  id: string;
  combatClassLabel: string;
  displayName: string;
  nickname?: string | null;
  level: number;
  unspentSkillPoints: number;
  skills: MinionSkillView[];
  equippedWeapon: MinionEquipmentSource["equippedWeapon"];
  equippedArmor: MinionEquipmentSource["equippedArmor"];
  combatStats: MinionCombatBreakdown;
  traits: Array<{ type: string; rank: number }>;
};

/** @deprecated use MeDashboardRepresentativeMinion */
export type MeDashboardStrongestMinion = MeDashboardRepresentativeMinion;

export type MeDashboardAssets = {
  goldAvailable: number;
  goldLocked: number;
  inventoryEstimatedGold: number;
  weaponsEstimatedGold: number;
  totalEstimatedGold: number;
  inventoryKindCount: number;
  inventoryTotalQty: number;
  weaponCount: number;
};

export type MeDashboardLeaderboardHighlight = {
  boardKey: string;
  label: string;
  rank: number;
  score: number;
  scoreLabel: string;
};

export type MeDashboardLight = {
  ok: true;
  assets: MeDashboardAssets;
  pendingSales: MeDashboardPendingSale[];
  representativeMinion: MeDashboardRepresentativeMinion | null;
  /** @deprecated use representativeMinion */
  strongestMinion?: MeDashboardRepresentativeMinion | null;
  totalUnspentSkillPoints: number;
  knightOrder: KnightOrderView;
  leaderboardHighlights: MeDashboardLeaderboardHighlight[];
};

export type MeDashboard = MeDashboardLight;
