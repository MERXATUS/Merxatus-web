import type { RaidDifficultyMode } from "@/shared/raidRoster";

const HARD_BOSS_PREFIX = "진 ";
const LEGACY_HARD_SUFFIX = "-진";

/** 하드 레이드 보스 표기 — 예: [오만] 루시퍼 → 진 [오만] 루시퍼 */
export function hardRaidBossDisplayName(name: string): string {
  let trimmed = name.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith(HARD_BOSS_PREFIX)) return trimmed;
  if (trimmed.endsWith(LEGACY_HARD_SUFFIX)) {
    trimmed = trimmed.slice(0, -LEGACY_HARD_SUFFIX.length).trimEnd();
  }
  return `${HARD_BOSS_PREFIX}${trimmed}`;
}

export function raidBossCombatDisplayName(
  monsterName: string,
  difficulty: RaidDifficultyMode | string | undefined,
  isBoss: boolean,
): string {
  if (difficulty !== "hard" || !isBoss) return monsterName;
  return hardRaidBossDisplayName(monsterName);
}
