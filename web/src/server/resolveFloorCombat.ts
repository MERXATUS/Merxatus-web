import { simulateFloorCombat, type CombatantInput, type FloorEnemy, type PartyHpSnapshot } from "@/server/dungeonBattler";
import type { DungeonEnemyCombatMults } from "@/shared/dungeonDifficulty";
import type { EnemyCombatTags } from "@/shared/equipmentCombatModifiers";
import type { CombatLogLine } from "@/shared/dungeonCombatLog";

export type FloorCombatResult = {
  outcome: "WIN" | "LOSS";
  log: CombatLogLine[];
  partyHp: PartyHpSnapshot[];
};

/** PvE 층 전투 — 턴 시뮬 (`simulateFloorCombat`) 단일 진입점 */
export function resolveFloorCombat(input: {
  floor: number;
  maxFloors: number;
  party: CombatantInput[];
  enemy: FloorEnemy;
  partyHp?: Record<string, { hp: number; maxHp: number }>;
  partyDamageMult?: number;
  enemyStatMult?: number;
  enemyCombatMults?: DungeonEnemyCombatMults;
  enemyTags?: EnemyCombatTags;
  monsterId?: string;
}): FloorCombatResult {
  const isBoss = input.enemyTags?.isBoss ?? input.floor >= input.maxFloors;
  const enemyTags: EnemyCombatTags = input.enemyTags ?? {
    isBoss,
    isAngel: false,
    isDemon: false,
  };

  return simulateFloorCombat({
    floor: input.floor,
    maxFloors: input.maxFloors,
    party: input.party,
    enemy: input.enemy,
    partyHp: input.partyHp,
    partyDamageMult: input.partyDamageMult,
    enemyStatMult: input.enemyStatMult,
    enemyCombatMults: input.enemyCombatMults,
    enemyTags,
    monsterId: input.monsterId,
  });
}
