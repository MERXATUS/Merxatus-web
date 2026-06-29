export const ITEM_LEVEL_MIN = 10;
export const ITEM_LEVEL_MAX = 140;
export const ITEM_LEVEL_STEP = 5;
export const ITEM_LEVEL_DEFAULT = ITEM_LEVEL_MIN;

export type ItemLevelTier = 1 | 2 | 3;

const TIER_BOUNDS: Record<ItemLevelTier, { min: number; max: number }> = {
  1: { min: 10, max: 50 },
  2: { min: 55, max: 95 },
  3: { min: 100, max: 140 },
};

export const ALL_ITEM_LEVELS: number[] = (() => {
  const out: number[] = [];
  for (let lv = ITEM_LEVEL_MIN; lv <= ITEM_LEVEL_MAX; lv += ITEM_LEVEL_STEP) out.push(lv);
  return out;
})();

export function itemLevelsForTier(tier: ItemLevelTier): number[] {
  const b = TIER_BOUNDS[tier];
  return ALL_ITEM_LEVELS.filter((lv) => lv >= b.min && lv <= b.max);
}

export function itemLevelTierForLevel(level: number): ItemLevelTier | null {
  const lv = normalizeItemLevel(level);
  if (lv <= 50) return 1;
  if (lv <= 95) return 2;
  if (lv <= 140) return 3;
  return null;
}

export function normalizeItemLevel(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return ITEM_LEVEL_DEFAULT;
  const snapped = Math.round(n / ITEM_LEVEL_STEP) * ITEM_LEVEL_STEP;
  return Math.max(ITEM_LEVEL_MIN, Math.min(ITEM_LEVEL_MAX, snapped));
}

export function isValidItemLevel(raw: unknown): boolean {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return false;
  const lv = Math.floor(n);
  return lv >= ITEM_LEVEL_MIN && lv <= ITEM_LEVEL_MAX && lv % ITEM_LEVEL_STEP === 0;
}

export function isItemLevelInTier(level: number, tier: ItemLevelTier): boolean {
  const lv = normalizeItemLevel(level);
  const b = TIER_BOUNDS[tier];
  return lv >= b.min && lv <= b.max;
}

/** 아이템 레벨 5단계마다 전투 배율 +1% (Lv10 기준 0%) */
export function itemLevelPowerMultiplier(itemLevel: number): number {
  const lv = normalizeItemLevel(itemLevel);
  const steps = (lv - ITEM_LEVEL_MIN) / ITEM_LEVEL_STEP;
  return 1 + steps * 0.01;
}

import { qualityPowerMultiplier } from "@/shared/equipmentQuality";

export function equipmentInstanceStatMultiplier(quality: number, itemLevel: number): number {
  return qualityPowerMultiplier(quality) * itemLevelPowerMultiplier(itemLevel);
}

export function itemLevelTierLabel(tier: ItemLevelTier): string {
  const b = TIER_BOUNDS[tier];
  return `Lv${b.min}~${b.max}`;
}
