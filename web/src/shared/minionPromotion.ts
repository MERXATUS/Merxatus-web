import type { MinionBaseStats } from "@/shared/minionBaseStats";
import { totalMinionBaseStats } from "@/shared/minionBaseStats";
import {
  advancedClassFromStats,
  type MinionCombatClass,
  normalizeMinionCombatClass,
} from "@/shared/minionDerivedClass";
import { weaponArchetypeFromBaseItemId } from "@/shared/minionWeaponRules";

/** 1차 전직(모험가 → 검사) 가능 레벨 */
export const MINION_FIRST_PROMOTION_LEVEL = 30;
/** 2차 전직(검사 → 특화 클래스) 가능 레벨 */
export const MINION_SECOND_PROMOTION_LEVEL = 70;

export type MinionPromotionTier = 0 | 1 | 2;

export type MinionPromotionState = {
  promotionTier: MinionPromotionTier;
  promotionClass: MinionCombatClass;
};

export function defaultMinionPromotionState(): MinionPromotionState {
  return { promotionTier: 0, promotionClass: "ADVENTURER" };
}

/** DB·API 공통 — 전직 단계에 따라 표시·규칙에 쓰는 전투 클래스 */
export function resolveMinionCombatClass(input: MinionPromotionState): MinionCombatClass {
  if (input.promotionTier === 0) return "ADVENTURER";
  return normalizeMinionCombatClass(input.promotionClass);
}

export function canAttemptFirstPromotion(level: number, promotionTier: number): boolean {
  return Math.floor(level) >= MINION_FIRST_PROMOTION_LEVEL && promotionTier === 0;
}

export function canAttemptSecondPromotion(level: number, promotionTier: number): boolean {
  return Math.floor(level) >= MINION_SECOND_PROMOTION_LEVEL && promotionTier === 1;
}

export type PromotionAvailability = {
  canPromoteFirst: boolean;
  canPromoteSecond: boolean;
  nextPromotionLabel: string | null;
};

export function minionPromotionAvailability(input: {
  level: number;
  promotionTier: number;
}): PromotionAvailability {
  const canPromoteFirst = canAttemptFirstPromotion(input.level, input.promotionTier);
  const canPromoteSecond = canAttemptSecondPromotion(input.level, input.promotionTier);
  let nextPromotionLabel: string | null = null;
  if (canPromoteFirst) nextPromotionLabel = "1차 전직 (검사)";
  else if (canPromoteSecond) nextPromotionLabel = "2차 전직";
  return { canPromoteFirst, canPromoteSecond, nextPromotionLabel };
}

export type FirstPromotionError = "NO_SWORD_EQUIPPED";

export function validateFirstPromotion(weaponBaseItemId: string | null | undefined):
  | { ok: true; promotionClass: "SWORDSMAN" }
  | { ok: false; error: FirstPromotionError } {
  const arch = weaponBaseItemId ? weaponArchetypeFromBaseItemId(weaponBaseItemId) : null;
  if (arch !== "SWORD") return { ok: false, error: "NO_SWORD_EQUIPPED" };
  return { ok: true, promotionClass: "SWORDSMAN" };
}

export type SecondPromotionError = "NO_STATS_FOR_PROMOTION";

export function validateSecondPromotion(baseStats: MinionBaseStats):
  | { ok: true; promotionClass: MinionCombatClass }
  | { ok: false; error: SecondPromotionError } {
  if (totalMinionBaseStats(baseStats) <= 0) return { ok: false, error: "NO_STATS_FOR_PROMOTION" };
  return { ok: true, promotionClass: advancedClassFromStats(baseStats) };
}

export function promotionStateFromRow(row: unknown): MinionPromotionState {
  const r = row as { promotionTier?: number | null; promotionClass?: string | null };
  const tier = Math.max(0, Math.min(2, Math.floor(r.promotionTier ?? 0))) as MinionPromotionTier;
  const promotionClass =
    tier === 0 ? "ADVENTURER" : normalizeMinionCombatClass(r.promotionClass ?? "ADVENTURER");
  return { promotionTier: tier, promotionClass };
}
