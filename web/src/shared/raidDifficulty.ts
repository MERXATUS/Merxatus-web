import { contentTierForRaidId } from "@/shared/craftingItemDrops";

export type RaidDifficultyMeta = {
  /** 파티 합산 전투력 권장 (최대 3인 기준) */
  recommendedPartyPower: number;
  /** 1인당 참고치 */
  recommendedPerMinion: number;
  label: string;
  stars: number;
};

const DIFFICULTY_BY_TIER: Record<number, { label: string; stars: number }> = {
  1: { label: "입문", stars: 1 },
  2: { label: "쉬움", stars: 2 },
  3: { label: "보통", stars: 3 },
  4: { label: "어려움", stars: 4 },
  5: { label: "험난", stars: 5 },
  6: { label: "극한", stars: 6 },
  7: { label: "극한", stars: 6 },
  8: { label: "극한", stars: 6 },
};

/** 난이도 별 UI 탭 (별 수 오름차순) */
export const RAID_DIFFICULTY_STAR_ORDER = [1, 2, 3, 4, 5, 6] as const;

export type RaidDifficultyStar = (typeof RAID_DIFFICULTY_STAR_ORDER)[number];

const DIFFICULTY_LABEL_BY_STARS: Record<number, string> = {
  1: "입문",
  2: "쉬움",
  3: "보통",
  4: "어려움",
  5: "험난",
  6: "극한",
};

export function difficultyLabelForStars(stars: number): string {
  return DIFFICULTY_LABEL_BY_STARS[Math.max(1, Math.min(6, Math.floor(stars)))] ?? "보통";
}

export function difficultyTabLabel(stars: number): string {
  const s = Math.max(1, Math.min(6, Math.floor(stars)));
  return `${formatRaidDifficultyStars(s)} ${difficultyLabelForStars(s)}`;
}

/** 몬스터 combatPowerFromMonster 와 같은 척도 — 파티 합산 권장치 */
export function recommendedPartyPowerForRaid(enemyPower: number, isBoss: boolean, maxPartySize = 3): number {
  const ep = Math.max(1, Math.floor(enemyPower));
  const mult = isBoss ? 2.35 : 1.55;
  const base = Math.ceil(ep * mult);
  const cap = maxPartySize >= 3 ? base : Math.ceil(base * (3 / Math.max(1, maxPartySize)));
  return Math.max(ep, cap);
}

export function raidDifficultyMeta(
  raidId: string,
  enemyPower: number,
  isBoss: boolean,
  maxPartySize = 3,
): RaidDifficultyMeta {
  const tier = contentTierForRaidId(raidId);
  const diff = DIFFICULTY_BY_TIER[Math.max(1, Math.min(8, tier))] ?? DIFFICULTY_BY_TIER[5]!;
  const recommendedPartyPower = recommendedPartyPowerForRaid(enemyPower, isBoss, maxPartySize);
  const recommendedPerMinion = Math.ceil(recommendedPartyPower / Math.max(1, maxPartySize));
  return {
    recommendedPartyPower,
    recommendedPerMinion,
    label: diff.label,
    stars: diff.stars,
  };
}

export function formatRaidDifficultyStars(stars: number): string {
  const n = Math.max(1, Math.min(6, Math.floor(stars)));
  return "★".repeat(n) + "☆".repeat(6 - n);
}

export function formatRaidDifficultyLine(meta: Pick<RaidDifficultyMeta, "recommendedPartyPower" | "label" | "stars">) {
  return `권장 ${meta.recommendedPartyPower.toLocaleString()} · ${meta.label} ${formatRaidDifficultyStars(meta.stars)}`;
}

export function partyPowerAdequacy(partyPower: number, recommendedPartyPower: number): "low" | "ok" | "high" {
  const p = Math.max(0, Math.floor(partyPower));
  const r = Math.max(1, Math.floor(recommendedPartyPower));
  if (p < r * 0.85) return "low";
  if (p >= r * 1.15) return "high";
  return "ok";
}
