import { scaleEquipmentCombatPower } from "@/shared/combatPowerScale";
import type { EquipmentStatBonus } from "@/shared/itemOptionCatalog";

/** 장비 스탯 → CP 환산 가중치 (미니언 4스탯은 `gameRules.minion.baseStats`와 동기) */
export const EQUIPMENT_CP_WEIGHTS = {
  atk: 1,
  magic: 1,
  strength: 0.28,
  agility: 0.24,
  intelligence: 0.24,
  endurance: 0.28,
  /** 방어구 HP/DEF — `hpDefToArmorCombatPower`와 동일 */
  hp: 0.2,
  def: 2,
} as const;

export type EquipmentCombatStatInput = {
  atk?: number;
  magic?: number;
  hp?: number;
  def?: number;
} & Partial<EquipmentStatBonus>;

/** 무기·방어구 공통 — 스탯 가중합 → CP (raw, 표시는 `scaleEquipmentCombatPower`) */
export function combatPowerFromEquipmentStats(input: EquipmentCombatStatInput): number {
  const w = EQUIPMENT_CP_WEIGHTS;
  const sum =
    Math.max(0, input.atk ?? 0) * w.atk +
    Math.max(0, input.magic ?? 0) * w.magic +
    Math.max(0, input.hp ?? 0) * w.hp +
    Math.max(0, input.def ?? 0) * w.def +
    Math.max(0, input.strength ?? 0) * w.strength +
    Math.max(0, input.agility ?? 0) * w.agility +
    Math.max(0, input.intelligence ?? 0) * w.intelligence +
    Math.max(0, input.endurance ?? 0) * w.endurance;
  return Math.max(1, Math.round(sum));
}

/** UI·매입가용 표시 CP */
export function displayCombatPowerFromEquipmentStats(input: EquipmentCombatStatInput): number {
  return scaleEquipmentCombatPower(combatPowerFromEquipmentStats(input));
}
