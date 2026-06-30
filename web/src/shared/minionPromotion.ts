import type { MinionBaseStats } from "@/shared/minionBaseStats";
import { totalMinionBaseStats } from "@/shared/minionBaseStats";
import {
  advancedClassFromStats,
  masterClassFromSecondClass,
  type MinionCombatClass,
  normalizeMinionCombatClass,
} from "@/shared/minionDerivedClass";
import { weaponArchetypeFromBaseItemId } from "@/shared/minionWeaponRules";

/** 1차 전직(모험가 → 검사) */
export const MINION_FIRST_PROMOTION_CP = 80;
/** 2차 전직(검사 → 특화) */
export const MINION_SECOND_PROMOTION_CP = 200;
/** 3차 전직(특화 → 마스터) */
export const MINION_THIRD_PROMOTION_CP = 450;

/** @deprecated 레벨 게이트 제거 */
export const MINION_FIRST_PROMOTION_LEVEL = MINION_FIRST_PROMOTION_CP;
export const MINION_SECOND_PROMOTION_LEVEL = MINION_SECOND_PROMOTION_CP;
export const MINION_THIRD_PROMOTION_LEVEL = MINION_THIRD_PROMOTION_CP;

export type MinionPromotionTier = 0 | 1 | 2 | 3;

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

export function canAttemptFirstPromotion(combatPower: number, promotionTier: number): boolean {
  return Math.floor(combatPower) >= MINION_FIRST_PROMOTION_CP && promotionTier === 0;
}

export function canAttemptSecondPromotion(combatPower: number, promotionTier: number): boolean {
  return Math.floor(combatPower) >= MINION_SECOND_PROMOTION_CP && promotionTier === 1;
}

export function canAttemptThirdPromotion(combatPower: number, promotionTier: number): boolean {
  return Math.floor(combatPower) >= MINION_THIRD_PROMOTION_CP && promotionTier === 2;
}

export type PromotionAvailability = {
  canPromoteFirst: boolean;
  canPromoteSecond: boolean;
  canPromoteThird: boolean;
  nextPromotionLabel: string | null;
};

export function minionPromotionAvailability(input: {
  combatPower: number;
  promotionTier: number;
}): PromotionAvailability {
  const canPromoteFirst = canAttemptFirstPromotion(input.combatPower, input.promotionTier);
  const canPromoteSecond = canAttemptSecondPromotion(input.combatPower, input.promotionTier);
  const canPromoteThird = canAttemptThirdPromotion(input.combatPower, input.promotionTier);
  let nextPromotionLabel: string | null = null;
  if (canPromoteFirst) nextPromotionLabel = "1차 전직 (검사)";
  else if (canPromoteSecond) nextPromotionLabel = "2차 전직";
  else if (canPromoteThird) nextPromotionLabel = "3차 전직";
  return { canPromoteFirst, canPromoteSecond, canPromoteThird, nextPromotionLabel };
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

export type ThirdPromotionError = "NO_MASTER_CLASS";

export function validateThirdPromotion(promotionClass: MinionCombatClass):
  | { ok: true; promotionClass: MinionCombatClass }
  | { ok: false; error: ThirdPromotionError } {
  const next = masterClassFromSecondClass(promotionClass);
  if (!next) return { ok: false, error: "NO_MASTER_CLASS" };
  return { ok: true, promotionClass: next };
}

export function promotionStateFromRow(row: unknown): MinionPromotionState {
  const r = row as { promotionTier?: number | null; promotionClass?: string | null };
  const tier = Math.max(0, Math.min(3, Math.floor(r.promotionTier ?? 0))) as MinionPromotionTier;
  const promotionClass =
    tier === 0 ? "ADVENTURER" : normalizeMinionCombatClass(r.promotionClass ?? "ADVENTURER");
  return { promotionTier: tier, promotionClass };
}
