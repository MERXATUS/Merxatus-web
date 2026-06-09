import type { MonsterDef } from "@/server/monsterData";

export type FighterCombatStats = {
  maxHp: number;
  atkMin: number;
  atkMax: number;
  def: number;
};

/** monster.csv 스탯 → 전투 HP/공격 */
export function fighterStatsFromMonster(m: MonsterDef): FighterCombatStats {
  const atk = Math.max(1, Math.floor(m.atk));
  const magicBonus = Math.max(0, Math.floor(m.magic));
  return {
    maxHp: Math.max(1, Math.floor(m.hp)),
    atkMin: atk,
    atkMax: atk + magicBonus + Math.max(1, Math.floor(atk * 0.15)),
    def: Math.max(0, Math.floor(m.def)),
  };
}

export function scaleFighterStats(stats: FighterCombatStats, mult: number): FighterCombatStats {
  const m = Math.max(1, mult);
  return scaleFighterStatsByChannel(stats, { hp: m, atk: m, def: m });
}

export function scaleFighterStatsByChannel(
  stats: FighterCombatStats,
  mult: { hp: number; atk: number; def: number },
): FighterCombatStats {
  const hpM = Math.max(1, mult.hp);
  const atkM = Math.max(1, mult.atk);
  const defM = Math.max(0, mult.def);
  return {
    maxHp: Math.max(1, Math.floor(stats.maxHp * hpM)),
    atkMin: Math.max(1, Math.floor(stats.atkMin * atkM)),
    atkMax: Math.max(1, Math.floor(stats.atkMax * atkM)),
    def: Math.max(0, Math.floor(stats.def * defM)),
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
