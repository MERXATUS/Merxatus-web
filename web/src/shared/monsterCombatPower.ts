/** 몬스터 JSON 스탯 → 전투력 추정 (클라이언트·서버 공용, raw — 승률 계산용) */
import { scaleCombatPower } from "@/shared/combatPowerScale";

export function combatPowerFromMonster(m: {  hp: number;
  atk: number;
  magic: number;
  def: number;
}): number {
  return Math.max(1, Math.floor(m.hp * 0.8 + m.atk * 4 + m.magic * 3 + m.def * 2));
}

/** UI·입장 조건용 표시 CP */
export function displayCombatPowerFromMonster(m: {
  hp: number;
  atk: number;
  magic: number;
  def: number;
}): number {
  return scaleCombatPower(combatPowerFromMonster(m));
}
