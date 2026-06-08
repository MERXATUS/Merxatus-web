const LOWER_NAMED_BOSS_MONSTERS = new Set([
  "demon_barbatos",
  "demon_lerajie",
  "demon_eligos",
  "demon_naberius",
  "demon_glasya",
  "demon_bune",
  "demon_ronove",
  "angel_cassiel",
  "angel_sachiel",
  "angel_anael",
  "angel_raphael",
  "angel_gabriel",
  "angel_michael",
  "angel_uriel",
]);

const UPPER_NAMED_BOSS_MONSTERS = new Set([
  "demon_baal",
  "demon_agares",
  "demon_paimon",
  "demon_astaroth",
  "demon_asmodeus",
  "demon_belial",
  "demon_vassago",
  "angel_metatron",
  "angel_raziel",
  "angel_zadkiel",
  "angel_camael",
  "angel_haniel",
  "angel_zophiel",
  "angel_raguel",
]);

function monsterIdFromRaidId(raidId: string): string | null {
  const id = raidId.trim().toLowerCase();
  const m = id.match(/^raid_boss_(.+)$/);
  return m?.[1] ?? null;
}

export function raidKindLabel(raidId: string, isBoss?: boolean): string {
  if (!isBoss) return "몬스터";
  const monsterId = monsterIdFromRaidId(raidId);
  if (monsterId && UPPER_NAMED_BOSS_MONSTERS.has(monsterId)) return "상급 보스";
  if (monsterId && LOWER_NAMED_BOSS_MONSTERS.has(monsterId)) return "하급 보스";
  return "보스";
}
