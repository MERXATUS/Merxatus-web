import { GAME_RULES } from "@/server/gameRules";

export function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function computePartyPower(input: {
  members: Array<{
    weaponBaseItemId: string | null | undefined;
    weaponEnhanceLevel?: number | null;
    /** 무기 옵션에서 합산된 전투력 보너스 */
    weaponOptionBonus?: number | null;
    /** 방어구 HP/DEF 기반 전투력 환산 합 */
    armorPowerBonus?: number | null;
    level?: number | null;
    fighterRank?: number | null;
  }>;
}) {
  const base = GAME_RULES.combat.baseMinionPower;
  const perLevel = GAME_RULES.combat.levelPowerPerLevel;
  const perFighter = GAME_RULES.combat.fighterTraitPowerPerRank;
  const weaponMap = GAME_RULES.combat.weaponPowerByItemId as Record<string, number>;
  const perWeaponLevel = GAME_RULES.combat.weaponLevelPowerPerLevel;
  let power = 0;
  for (const m of input.members) {
    power += base;
    const level = Math.max(1, Math.floor(m.level ?? 1));
    power += Math.max(0, (level - 1) * perLevel);
    const fighterRank = Math.max(0, Math.floor(m.fighterRank ?? 0));
    power += fighterRank * perFighter;
    if (m.weaponBaseItemId) {
      const wBase = Math.max(0, Math.floor(weaponMap[m.weaponBaseItemId] ?? 0));
      const wLv = Math.max(0, Math.floor(m.weaponEnhanceLevel ?? 0));
      power += wBase + wLv * perWeaponLevel;
      const ob = m.weaponOptionBonus;
      if (typeof ob === "number" && Number.isFinite(ob) && ob > 0) power += ob;
    }
    const ap = Math.max(0, Math.floor(m.armorPowerBonus ?? 0));
    power += ap;
  }
  return power;
}

export function computeWinRate(input: { partyPower: number; enemyPower: number }) {
  const pp = Math.max(0, Math.floor(input.partyPower));
  const dp = Math.max(1, Math.floor(input.enemyPower));
  const raw = pp / (pp + dp);
  const cmin = GAME_RULES.combat.winRateClamp.min;
  const cmax = GAME_RULES.combat.winRateClamp.max;
  return Math.max(cmin, Math.min(cmax, clamp01(raw)));
}

