/** 메이플 유니온 스타일 — 보유 미니언 레벨 합산 기사단 보너스 */

export type KnightOrderBonuses = {
  /** 보유 미니언 레벨 합 */
  totalLevel: number;
  /** 표시용 기사단 레벨 (총 레벨 / step) */
  orderLevel: number;
  minionCount: number;
  /** 다음 기사단 레벨까지 필요한 추가 총 레벨 (만렙이면 0) */
  levelsToNextOrderLevel: number;
  atkPct: number;
  magicPct: number;
  finalDamagePct: number;
  bossDamagePct: number;
  /** 파티 전투력·승률 추정에 곱함 */
  partyPowerMult: number;
  /** 시뮬 전투 피해배율 (최종 데미지) */
  finalDamageMult: number;
  /** 보스 전투 시 추가 배율 (최종 데미지와 곱) */
  bossDamageMult: number;
};

export type KnightOrderBonusRow = {
  key: keyof Pick<KnightOrderBonuses, "atkPct" | "magicPct" | "finalDamagePct" | "bossDamagePct">;
  label: string;
  value: number;
  unit: "%";
};

export const KNIGHT_ORDER_LEVEL_STEP = 20;

export type KnightOrderRules = {
  levelStep: number;
  perTotalLevel: { atk: number; magic: number; finalDamage: number; bossDamage: number };
  perOrderLevel: { atk: number; magic: number; finalDamage: number; bossDamage: number };
  cap: { atk: number; magic: number; finalDamage: number; bossDamage: number };
};

/** `gameRules.knightOrder`와 동기 — 서버에서 주입 */
export const DEFAULT_KNIGHT_ORDER_RULES: KnightOrderRules = {
  levelStep: KNIGHT_ORDER_LEVEL_STEP,
  perTotalLevel: { atk: 0.02, magic: 0.018, finalDamage: 0.012, bossDamage: 0.014 },
  perOrderLevel: { atk: 0.45, magic: 0.4, finalDamage: 0.28, bossDamage: 0.35 },
  cap: { atk: 60, magic: 55, finalDamage: 45, bossDamage: 70 },
};

function capPct(value: number, max: number) {
  return Math.min(max, Math.max(0, value));
}

export function knightOrderBonusesFromTotalLevel(
  totalLevel: number,
  minionCount = 0,
  rules: KnightOrderRules = DEFAULT_KNIGHT_ORDER_RULES,
): KnightOrderBonuses {
  const tl = Math.max(0, Math.floor(totalLevel));
  const step = Math.max(1, rules.levelStep);
  const orderLevel = Math.floor(tl / step);
  const nextThreshold = (orderLevel + 1) * step;
  const levelsToNextOrderLevel = tl >= nextThreshold ? 0 : nextThreshold - tl;

  const atkPct = capPct(
    tl * rules.perTotalLevel.atk + orderLevel * rules.perOrderLevel.atk,
    rules.cap.atk,
  );
  const magicPct = capPct(
    tl * rules.perTotalLevel.magic + orderLevel * rules.perOrderLevel.magic,
    rules.cap.magic,
  );
  const finalDamagePct = capPct(
    tl * rules.perTotalLevel.finalDamage + orderLevel * rules.perOrderLevel.finalDamage,
    rules.cap.finalDamage,
  );
  const bossDamagePct = capPct(
    tl * rules.perTotalLevel.bossDamage + orderLevel * rules.perOrderLevel.bossDamage,
    rules.cap.bossDamage,
  );

  return {
    totalLevel: tl,
    orderLevel,
    minionCount: Math.max(0, Math.floor(minionCount)),
    levelsToNextOrderLevel,
    atkPct,
    magicPct,
    finalDamagePct,
    bossDamagePct,
    partyPowerMult: (1 + atkPct / 100) * (1 + magicPct / 100),
    finalDamageMult: 1 + finalDamagePct / 100,
    bossDamageMult: 1 + bossDamagePct / 100,
  };
}

export function applyKnightOrderPartyPower(basePower: number, bonuses: KnightOrderBonuses): number {
  const base = Math.max(0, Math.floor(basePower));
  return Math.max(0, Math.floor(base * bonuses.partyPowerMult));
}

/** 보스 여부에 따른 파티 타격 배율 (최종×보스) */
export function knightOrderPartyDamageMult(bonuses: KnightOrderBonuses, isBoss: boolean): number {
  return bonuses.finalDamageMult * (isBoss ? bonuses.bossDamageMult : 1);
}

export function knightOrderBonusRows(bonuses: KnightOrderBonuses): KnightOrderBonusRow[] {
  return [
    { key: "atkPct", label: "공격력", value: bonuses.atkPct, unit: "%" },
    { key: "magicPct", label: "마력", value: bonuses.magicPct, unit: "%" },
    { key: "finalDamagePct", label: "최종 데미지", value: bonuses.finalDamagePct, unit: "%" },
    { key: "bossDamagePct", label: "보스 데미지", value: bonuses.bossDamagePct, unit: "%" },
  ];
}
