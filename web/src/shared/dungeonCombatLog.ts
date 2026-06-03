export type CombatLogLine =
  | { t: "floor_start"; floor: number; enemyName: string; enemyMaxHp?: number }
  | { t: "hit"; side: "party" | "enemy"; actor: string; target: string; damage: number }
  | { t: "ko"; side: "party" | "enemy"; name: string }
  | { t: "result"; outcome: "WIN" | "LOSS" };

import type { CombatPortraitView } from "@/shared/combatPortrait";

export type DungeonCombatReplay = {
  floor: number;
  enemy: { name: string; maxHp: number; monsterId?: string; portrait?: CombatPortraitView };
  partyBefore: Array<{
    minionId: string;
    label: string;
    hp: number;
    maxHp: number;
    portrait?: CombatPortraitView;
  }>;
};

/** 관전 로그 한 줄 텍스트 */
export function formatCombatLogLine(line: CombatLogLine): string {
  switch (line.t) {
    case "floor_start":
      return `— ${line.floor}층 · ${line.enemyName} —`;
    case "hit":
      return `${line.actor} → ${line.target}  ${line.damage}`;
    case "ko":
      return `${line.name} 처치!`;
    case "result":
      return line.outcome === "WIN" ? "✦ 층 클리어!" : "✦ 전멸… 누적 보상 소멸";
    default:
      return "";
  }
}
