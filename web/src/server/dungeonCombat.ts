import { GAME_RULES } from "@/server/gameRules";
import { minionBaseStatsFromRow, type MinionBaseStats } from "@/shared/minionBaseStats";
import { weaponBasePower, weaponEnhancePowerBonus } from "@/shared/weaponTooltip";

export function statPowerFromBaseStats(stats: MinionBaseStats) {
  const w = GAME_RULES.minion.baseStats;
  return (
    stats.strength * w.powerPerStrength +
    stats.agility * w.powerPerAgility +
    stats.intelligence * w.powerPerIntelligence +
    stats.endurance * w.powerPerEndurance
  );
}

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
    /** 품질·아이템 레벨 배율 (무기 전투력) */
    weaponInstanceScale?: number | null;
    level?: number | null;
    fighterRank?: number | null;
    strength?: number | null;
    agility?: number | null;
    intelligence?: number | null;
    endurance?: number | null;
  }>;
}) {
  const base = GAME_RULES.combat.baseMinionPower;
  const perLevel = GAME_RULES.combat.levelPowerPerLevel;
  const perFighter = GAME_RULES.combat.fighterTraitPowerPerRank;
  const weaponMap = GAME_RULES.combat.weaponPowerByItemId as Record<string, number>;
  let power = 0;
  for (const m of input.members) {
    power += base;
    const level = Math.max(1, Math.floor(m.level ?? 1));
    power += Math.max(0, (level - 1) * perLevel);
    const fighterRank = Math.max(0, Math.floor(m.fighterRank ?? 0));
    power += fighterRank * perFighter;
    if (m.weaponBaseItemId) {
      const wScale = Math.max(0.01, Number(m.weaponInstanceScale ?? 1) || 1);
      const wBase = Math.max(0, Math.floor(weaponMap[m.weaponBaseItemId] ?? weaponBasePower(m.weaponBaseItemId)));
      const wLv = Math.max(0, Math.floor(m.weaponEnhanceLevel ?? 0));
      const wPart = wBase + weaponEnhancePowerBonus(m.weaponBaseItemId, wLv);
      const ob = m.weaponOptionBonus;
      const opt = typeof ob === "number" && Number.isFinite(ob) && ob > 0 ? ob : 0;
      power += Math.floor((wPart + opt) * wScale);
    }
    const ap = Math.max(0, Math.floor(m.armorPowerBonus ?? 0));
    power += ap;
    const sp = Math.max(0, Math.floor(m.skillPowerBonus ?? 0));
    power += sp;
    const stats = minionBaseStatsFromRow({
      strength: m.strength ?? undefined,
      agility: m.agility ?? undefined,
      intelligence: m.intelligence ?? undefined,
      endurance: m.endurance ?? undefined,
    });
    power += Math.floor(statPowerFromBaseStats(stats));
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

