/** 전투력 숫자 → 실전 HP/공격 환산 (던전·레이드·PVP 공통) */
export const PARTY_POWER_TO_COMBAT = {
  hpPerPower: 1.85,
  atkPerPower: 0.28,
  atkSpreadPerPower: 0.14,
  minHp: 24,
  minAtk: 4,
  minAtkSpread: 2,
} as const;

/** 레이드 적 전투 스탯 배율 */
export const RAID_ENEMY_STAT_MULT = {
  boss: 1.3,
  normal: 1.15,
} as const;

export function partyStatsFromPower(power: number) {
  const p = Math.max(1, Math.floor(power));
  const { hpPerPower, atkPerPower, atkSpreadPerPower, minHp, minAtk, minAtkSpread } = PARTY_POWER_TO_COMBAT;
  const maxHp = Math.max(minHp, Math.floor(p * hpPerPower));
  const baseAtk = Math.max(minAtk, Math.floor(p * atkPerPower));
  return {
    maxHp,
    atkMin: baseAtk,
    atkMax: baseAtk + Math.max(minAtkSpread, Math.floor(p * atkSpreadPerPower)),
  };
}

export function raidEnemyStatMult(isBoss: boolean): number {
  return isBoss ? RAID_ENEMY_STAT_MULT.boss : RAID_ENEMY_STAT_MULT.normal;
}
