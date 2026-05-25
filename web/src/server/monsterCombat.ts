import type { MonsterDef } from "@/server/monsterData";

/** monster.csv 스탯 → 전투 HP/공격 */
export function fighterStatsFromMonster(m: MonsterDef) {
  const atk = Math.max(1, Math.floor(m.atk));
  const magicBonus = Math.max(0, Math.floor(m.magic));
  return {
    maxHp: Math.max(1, Math.floor(m.hp)),
    atkMin: atk,
    atkMax: atk + magicBonus + Math.max(1, Math.floor(atk * 0.15)),
    def: Math.max(0, Math.floor(m.def)),
  };
}

/** AUTO_WAVES 승률 추정용 단일 수치 (파티 power와 같은 척도) */
export function combatPowerFromMonster(m: MonsterDef) {
  return Math.max(
    1,
    Math.floor(m.hp * 0.8 + m.atk * 4 + m.magic * 3 + m.def * 2),
  );
}

export function applyDefense(rawDamage: number, def: number) {
  return Math.max(1, Math.floor(rawDamage) - Math.max(0, Math.floor(def * 0.5)));
}
