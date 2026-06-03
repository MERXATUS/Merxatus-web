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

/** 강화 주문서 등급 (하급 → 상급) */
export const ENHANCE_SCROLL_ITEM_IDS = [
  "item_enhance_scroll_low",
  "item_enhance_scroll_mid",
  "item_enhance_scroll_high",
] as const;

function enhanceScrollTierIndex(itemId: string): number {
  return ENHANCE_SCROLL_ITEM_IDS.indexOf(itemId as (typeof ENHANCE_SCROLL_ITEM_IDS)[number]);
}

/** 요구 등급 이상 주문서 보유량 합산 (UI·검증용) */
export function enhanceScrollQtyAtOrAboveTier(
  requiredItemId: string,
  stackQty: (itemId: string) => number,
): number {
  const tier = enhanceScrollTierIndex(requiredItemId);
  if (tier < 0) return stackQty(requiredItemId);
  let sum = 0;
  for (let t = tier; t < ENHANCE_SCROLL_ITEM_IDS.length; t++) {
    sum += stackQty(ENHANCE_SCROLL_ITEM_IDS[t]!);
  }
  return sum;
}

/** 테이블 재료 → 실제 차감 스택 (상위 주문서로 대체 가능) */
export function resolveWeaponUpgradeDeductions(
  requiredMaterials: Array<{ itemId: string; quantity: number }>,
  stackQty: (itemId: string) => number,
): Array<{ itemId: string; quantity: number }> | null {
  const out: Array<{ itemId: string; quantity: number }> = [];
  for (const m of requiredMaterials) {
    const tier = enhanceScrollTierIndex(m.itemId);
    if (tier >= 0) {
      let picked: { itemId: string; quantity: number } | null = null;
      for (let t = tier; t < ENHANCE_SCROLL_ITEM_IDS.length; t++) {
        const id = ENHANCE_SCROLL_ITEM_IDS[t]!;
        if (stackQty(id) >= m.quantity) {
          picked = { itemId: id, quantity: m.quantity };
          break;
        }
      }
      if (!picked) return null;
      out.push(picked);
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
