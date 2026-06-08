export type RaidFaction = "demon" | "angel" | "void";

export const RAID_FACTION_LABELS: Record<RaidFaction, string> = {
  demon: "악마 진영",
  angel: "천사 진영",
  void: "이계",
};

export const RAID_FACTION_ORDER: RaidFaction[] = ["demon", "angel", "void"];

export function normalizeRaidFaction(raw: string | undefined | null): RaidFaction {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "demon" || v === "abyss" || v === "악마" || v === "마계") return "demon";
  if (v === "angel" || v === "celestial" || v === "천사" || v === "천계") return "angel";
  return "void";
}

/** 레이드 클리어 골드 — 티어·보스 여부 반영 */
export function raidClearGoldReward(tier: number, isBoss: boolean): number {
  const t = Math.max(1, Math.min(8, Math.floor(tier)));
  const base = 30 + t * 35;
  return isBoss ? Math.floor(base * 2.2) : base;
}
