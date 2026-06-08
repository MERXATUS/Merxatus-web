import type { MeDashboardLight } from "@/shared/meDashboard";

export type MeSummary = {
  ok: true;
  username?: string | null;
  wallet: { goldAvailable: number; goldLocked: number };
  market: { activeListingCount: number; maxActiveListings: number };
  todayNetGold: number;
  inventory: { kindCount: number; totalQty: number; weaponCount: number };
  mercenaries: { count: number; maxCount: number; topLevel: number | null };
  dungeon: { active: boolean; name: string | null };
};

export type DungeonRunState = {
  ok: true;
  active: boolean;
  dungeon?: { name: string };
  combat?: { partyPower: number; clearChance: number };
};

export type MeBootstrap = {
  ok: true;
  summary: MeSummary;
  dashboard: MeDashboardLight;
};
