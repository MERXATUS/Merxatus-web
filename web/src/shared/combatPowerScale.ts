/**
 * 표시·입장 조건·매입가 공통 CP 척도.
 * 내부 raw 합산 후 이 배율을 곱해 UI 숫자(10~수천)를 맞춘다.
 * 승률(pp/(pp+ep))은 파티·적 CP에 동일 적용되므로 비율 밸런스는 유지된다.
 */
export const COMBAT_POWER_SCALE = 50;

export function scaleCombatPower(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.floor(raw * COMBAT_POWER_SCALE));
}

/** UI·입장 조건·매입가에 쓰는 표시 전투력 (실전 HP/ATK 환산은 raw CP 사용) */
export const displayCombatPower = scaleCombatPower;

/** 장비 단독 CP — raw가 0~1이어도 표시 최소치 보장 */
export function scaleEquipmentCombatPower(raw: number): number {
  const scaled = scaleCombatPower(raw);
  if (raw > 0 && scaled < COMBAT_POWER_SCALE) return COMBAT_POWER_SCALE;
  return scaled;
}
