import { findRaidBoss } from "@/shared/raidRoster";

export function raidKindLabel(raidId: string, isBoss?: boolean): string {
  if (!isBoss) return "몬스터";
  const boss = findRaidBoss(raidId);
  if (!boss) return "보스";
  return boss.faction === "demon" ? "7대 죄악" : "7대 미덕";
}
