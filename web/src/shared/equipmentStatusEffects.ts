import type { StatusApplySpec } from "@/shared/combatStatus";

/** 방치형 전투 — 장비 옵션에서 상태이상 부여 없음 */
export function equipmentStatusEffectsFromGear(_input: {
  weaponOptionsJson?: string | null;
  armorOptionsJsonList?: Array<string | null | undefined>;
}): { onHit: StatusApplySpec[]; onFightStartSelf: StatusApplySpec[] } {
  return { onHit: [], onFightStartSelf: [] };
}
