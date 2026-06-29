export type RaidDifficultyMode = "normal" | "hard";

export type RaidBossDef = {
  key: string;
  /** [오만] / [겸손] 등 괄호 라벨 */
  title: string;
  name: string;
  monsterId: string;
  /** 1~7 — 콘텐츠 티어·표시 순서 */
  order: number;
  faction: "demon" | "angel";
};

export const RAID_DIFFICULTY_MODES: RaidDifficultyMode[] = ["normal", "hard"];

export const RAID_DIFFICULTY_LABELS: Record<RaidDifficultyMode, string> = {
  normal: "노말",
  hard: "하드",
};

/** 7대 죄악 — 악마 진영 */
export const DEMON_RAID_BOSSES: RaidBossDef[] = [
  { key: "lucifer", title: "[오만]", name: "루시퍼", monsterId: "demon_lucifer", order: 1, faction: "demon" },
  { key: "leviathan", title: "[질투]", name: "레비아탄", monsterId: "demon_leviathan", order: 2, faction: "demon" },
  { key: "satan", title: "[분노]", name: "사탄", monsterId: "demon_satan", order: 3, faction: "demon" },
  { key: "belphegor", title: "[나태]", name: "벨페고르", monsterId: "demon_belphegor", order: 4, faction: "demon" },
  { key: "mammon", title: "[탐욕]", name: "마몬", monsterId: "demon_mammon", order: 5, faction: "demon" },
  { key: "beelzebub", title: "[식탐]", name: "바알제붑", monsterId: "demon_beelzebub", order: 6, faction: "demon" },
  { key: "asmodeus", title: "[색욕]", name: "아스모데우스", monsterId: "demon_asmodeus", order: 7, faction: "demon" },
];

/** 7대 미덕 — 천사 진영 */
export const ANGEL_RAID_BOSSES: RaidBossDef[] = [
  { key: "michael", title: "[겸손]", name: "미카엘", monsterId: "angel_michael", order: 1, faction: "angel" },
  { key: "raguel", title: "[친절]", name: "라구엘", monsterId: "angel_raguel", order: 2, faction: "angel" },
  { key: "jophiel", title: "[인내]", name: "요피엘", monsterId: "angel_jophiel", order: 3, faction: "angel" },
  { key: "gabriel", title: "[근면]", name: "가브리엘", monsterId: "angel_gabriel", order: 4, faction: "angel" },
  { key: "raphael", title: "[자선]", name: "라파엘", monsterId: "angel_raphael", order: 5, faction: "angel" },
  { key: "uriel", title: "[절제]", name: "우리엘", monsterId: "angel_uriel", order: 6, faction: "angel" },
  { key: "sariel", title: "[순결]", name: "사리엘", monsterId: "angel_sariel", order: 7, faction: "angel" },
];

export const ALL_RAID_BOSSES: RaidBossDef[] = [...DEMON_RAID_BOSSES, ...ANGEL_RAID_BOSSES];

export function raidIdFor(boss: RaidBossDef, mode: RaidDifficultyMode): string {
  return `raid_${boss.faction}_${boss.key}_${mode}`;
}

export function raidDisplayName(boss: RaidBossDef): string {
  return `${boss.title} ${boss.name}`;
}

export type ParsedRaidId = {
  faction: "demon" | "angel";
  key: string;
  mode: RaidDifficultyMode;
};

export function parseRaidId(raidId: string): ParsedRaidId | null {
  const m = raidId.trim().toLowerCase().match(/^raid_(demon|angel)_([a-z0-9]+)_(normal|hard)$/);
  if (!m) return null;
  return { faction: m[1] as "demon" | "angel", key: m[2]!, mode: m[3] as RaidDifficultyMode };
}

export function findRaidBoss(raidId: string): RaidBossDef | null {
  const parsed = parseRaidId(raidId);
  if (!parsed) return null;
  return ALL_RAID_BOSSES.find((b) => b.faction === parsed.faction && b.key === parsed.key) ?? null;
}

/** 보스 순서·모드 → 크래프팅/보상 티어 (2~8) */
export function contentTierForRaidBoss(order: number, mode: RaidDifficultyMode): number {
  const o = Math.max(1, Math.min(7, Math.floor(order)));
  const base = 1 + o;
  const tier = mode === "hard" ? base + 1 : base;
  return Math.max(2, Math.min(8, tier));
}

export function contentTierForRaidId(raidId: string): number {
  const boss = findRaidBoss(raidId);
  const parsed = parseRaidId(raidId);
  if (!boss || !parsed) return 5;
  return contentTierForRaidBoss(boss.order, parsed.mode);
}

/** 하드 모드 적 스탯 배율 */
export const RAID_HARD_STAT_MULT = 1.28;

export function raidModeStatMult(mode: RaidDifficultyMode | string | undefined): number {
  return mode === "hard" ? RAID_HARD_STAT_MULT : 1;
}

/** 몬스터 기본 스탯 — order 1~7 */
export function raidBossMonsterStats(order: number) {
  const o = Math.max(1, Math.min(7, Math.floor(order)));
  return {
    grade: Math.min(6, 1 + Math.ceil(o / 1.2)),
    hp: 620 + o * 115,
    atk: 24 + o * 4,
    magic: 10 + o * 6,
    as: 1,
    def: 12 + o * 4,
  };
}
