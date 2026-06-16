/** 전투 상태 이상 ID·표시명 — `dungeonCombatLog`와 순환 import 방지용 */
export type CombatStatusId = "burn" | "shock" | "freeze" | "counter";

export const COMBAT_STATUS_LABEL: Record<CombatStatusId, string> = {
  burn: "화상",
  shock: "감전",
  freeze: "빙결",
  counter: "반격",
};
