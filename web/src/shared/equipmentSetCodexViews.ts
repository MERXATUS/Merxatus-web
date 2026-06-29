import type { SetCodexBuffSlice } from "@/shared/equipmentSetCodex";

export type SetCodexTierView = {
  tierId: string;
  label: string;
  description: string;
  unlocked: boolean;
  buff: SetCodexBuffSlice;
};

export type SetCodexEntryView = {
  setId: string;
  name: string;
  grade: number;
  realm: string;
  tagline: string;
  itemCount: number;
  registeredSlots: number;
  totalSlots: number;
  completionPct: number;
  allBaseRegistered: boolean;
  tiers: SetCodexTierView[];
  buff: SetCodexBuffSlice;
  unlockedTierCount: number;
};
