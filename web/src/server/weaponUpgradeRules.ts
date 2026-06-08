import weaponEnhanceLevels from "../../data/weapon_enhance_levels.json";
import {
  WEAPON_ENHANCE_ABSOLUTE_MAX,
  weaponEnhanceMaxLevelForGrade,
} from "@/shared/weaponEnhanceLimits";

export { weaponEnhanceMaxLevelForGrade, WEAPON_ENHANCE_MAX_BY_GRADE, WEAPON_ENHANCE_ABSOLUTE_MAX } from "@/shared/weaponEnhanceLimits";

export type WeaponUpgradeCost = {
  gold: number;
  materials: Array<{ itemId: string; quantity: number }>;
  successRate: number;
};

type EnhanceLevelRow = {
  targetLevel: number;
  gold: number;
  scrollItemId: string | null;
  scrollQty: number;
  successRate: number;
};

const LEVELS = weaponEnhanceLevels as EnhanceLevelRow[];
const byTargetLevel = new Map(LEVELS.map((row) => [row.targetLevel, row]));

/** 비용 테이블 상한 (초월 30강까지) */
export function weaponEnhanceMaxLevel(): number {
  if (LEVELS.length === 0) return WEAPON_ENHANCE_ABSOLUTE_MAX;
  const tableMax = Math.max(...LEVELS.map((r) => r.targetLevel));
  return Math.min(tableMax, WEAPON_ENHANCE_ABSOLUTE_MAX);
}

export function weaponEnhanceMaxLevelForWeapon(grade: number): number {
  return Math.min(weaponEnhanceMaxLevelForGrade(grade), weaponEnhanceMaxLevel());
}

/** currentWeaponLevel(0~) → next level (= current + 1) 비용 */
export function weaponUpgradeCostForNextLevel(currentWeaponLevel: number): WeaponUpgradeCost {
  const cur = Math.max(0, Math.floor(currentWeaponLevel));
  const next = cur + 1;
  const row = byTargetLevel.get(next);
  if (!row) throw new Error("MAX_WEAPON_LEVEL");

  const materials: Array<{ itemId: string; quantity: number }> = [];
  if (row.scrollItemId && row.scrollQty > 0) {
    materials.push({ itemId: row.scrollItemId, quantity: row.scrollQty });
  }

  return {
    gold: Math.max(0, Math.ceil(row.gold)),
    materials,
    successRate: Math.max(0, Math.min(100, row.successRate)),
  };
}

/** 강화 재료 — 하급→상급 마석 (상위 등급은 플레이어가 직접 선택) */
export const ENHANCE_MANA_STONE_ITEM_IDS = [
  "item_lesser_mana_stone",
  "item_mana_stone",
  "item_greater_mana_stone",
] as const;

export type EnhanceManaStoneItemId = (typeof ENHANCE_MANA_STONE_ITEM_IDS)[number];

export const ENHANCE_MANA_STONE_LABELS: Record<EnhanceManaStoneItemId, string> = {
  item_lesser_mana_stone: "하급 마석",
  item_mana_stone: "중급 마석",
  item_greater_mana_stone: "상급 마석",
};

export const ENHANCE_MANA_STONE_SHORT_LABELS: Record<EnhanceManaStoneItemId, string> = {
  item_lesser_mana_stone: "하급",
  item_mana_stone: "중급",
  item_greater_mana_stone: "상급",
};

export function enhanceManaStoneLabel(itemId: string): string {
  if (isEnhanceManaStoneItemId(itemId)) return ENHANCE_MANA_STONE_LABELS[itemId];
  return itemId;
}

export function enhanceManaStoneTierIndex(itemId: string): number {
  const id = itemId.trim().toLowerCase();
  return ENHANCE_MANA_STONE_ITEM_IDS.indexOf(id as EnhanceManaStoneItemId);
}

function enhanceMaterialTierIndex(itemId: string): number {
  return enhanceManaStoneTierIndex(itemId);
}

export function isEnhanceManaStoneItemId(itemId: string): itemId is EnhanceManaStoneItemId {
  return enhanceManaStoneTierIndex(itemId) >= 0;
}

/** 강화 비용 중 마석 요구 (테이블 기준 1종) */
export function manaStoneRequirementFromCost(
  materials: Array<{ itemId: string; quantity: number }>,
): { itemId: string; quantity: number } | null {
  const row = materials.find((m) => enhanceManaStoneTierIndex(m.itemId) >= 0);
  return row ?? null;
}

/** 요구 등급 이상 · 수량 충족하는 사용 가능 마석 */
export function eligibleManaStonesForRequirement(
  requiredItemId: string,
  requiredQty: number,
  stackQty: (itemId: string) => number,
): EnhanceManaStoneItemId[] {
  const minTier = enhanceManaStoneTierIndex(requiredItemId);
  if (minTier < 0) return [];
  const out: EnhanceManaStoneItemId[] = [];
  for (let t = minTier; t < ENHANCE_MANA_STONE_ITEM_IDS.length; t++) {
    const id = ENHANCE_MANA_STONE_ITEM_IDS[t]!;
    if (stackQty(id) >= requiredQty) out.push(id);
  }
  return out;
}

function enhanceScrollTierIndex(itemId: string): number {
  return enhanceMaterialTierIndex(itemId);
}

function materialQtyAtOrAboveTier(tier: number, stackQty: (itemId: string) => number): number {
  let sum = 0;
  for (let t = tier; t < ENHANCE_MANA_STONE_ITEM_IDS.length; t++) {
    sum += stackQty(ENHANCE_MANA_STONE_ITEM_IDS[t]!);
  }
  return sum;
}

/** 요구 등급 이상 마석 보유량 합산 (UI·검증용) */
export function enhanceManaStoneQtyAtOrAboveTier(
  requiredItemId: string,
  stackQty: (itemId: string) => number,
): number {
  const tier = enhanceMaterialTierIndex(requiredItemId);
  if (tier < 0) return stackQty(requiredItemId);
  return materialQtyAtOrAboveTier(tier, stackQty);
}

/** @deprecated */
export const enhanceScrollQtyAtOrAboveTier = enhanceManaStoneQtyAtOrAboveTier;

/** 테이블 재료 → 실제 차감 스택 (`manaStoneItemId` 지정 시 해당 마석만 사용) */
export function resolveWeaponUpgradeDeductions(
  requiredMaterials: Array<{ itemId: string; quantity: number }>,
  stackQty: (itemId: string) => number,
  opts?: { manaStoneItemId?: string | null },
): Array<{ itemId: string; quantity: number }> | null {
  const out: Array<{ itemId: string; quantity: number }> = [];
  for (const m of requiredMaterials) {
    const tier = enhanceMaterialTierIndex(m.itemId);
    if (tier >= 0) {
      const chosenId = (opts?.manaStoneItemId?.trim() || m.itemId).toLowerCase();
      const chosenTier = enhanceManaStoneTierIndex(chosenId);
      if (chosenTier < 0 || chosenTier < tier) return null;
      if (stackQty(chosenId) < m.quantity) return null;
      out.push({ itemId: chosenId, quantity: m.quantity });
    } else if (stackQty(m.itemId) >= m.quantity) {
      out.push({ itemId: m.itemId, quantity: m.quantity });
    } else {
      return null;
    }
  }
  return out;
}

export function listWeaponEnhanceLevels(): EnhanceLevelRow[] {
  return LEVELS.slice();
}

/** successRate: 0~100 (표 기준) */
export function rollWeaponEnhanceSuccess(successRate: number, rnd = Math.random): boolean {
  const rate = Math.max(0, Math.min(100, Math.floor(successRate)));
  if (rate >= 100) return true;
  if (rate <= 0) return false;
  return rnd() * 100 < rate;
}
