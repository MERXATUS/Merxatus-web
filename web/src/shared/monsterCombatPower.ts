/** 몬스터 JSON 스탯 → 전투력 추정 (클라이언트·서버 공용) */
export function combatPowerFromMonster(m: {
  hp: number;
  atk: number;
  magic: number;
  def: number;
}): number {
  return Math.max(1, Math.floor(m.hp * 0.8 + m.atk * 4 + m.magic * 3 + m.def * 2));
}
