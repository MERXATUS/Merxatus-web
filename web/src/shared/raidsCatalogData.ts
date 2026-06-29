import raidsJson from "../../data/raids.json";
import monstersJson from "../../data/monsters.json";
import { combatPowerFromMonster } from "@/shared/monsterCombatPower";
import { minimumPartyPowerForRaid, raidDifficultyMeta } from "@/shared/raidDifficulty";
import type { RaidFaction } from "@/shared/raidFaction";
import { raidEntryTicketCost } from "@/shared/raidEntry";
import { raidModeStatMult, type RaidDifficultyMode } from "@/shared/raidRoster";

type RaidJson = (typeof raidsJson)[number];

export type RaidCatalogEntry = {
  id: string;
  name: string;
  maxPhases: number;
  maxPartySize: number;
  faction: RaidFaction;
  difficulty: RaidDifficultyMode;
  isBoss: boolean;
  enemyPower: number;
  recommendedPartyPower: number;
  minPartyPower: number;
  recommendedPerMinion: number;
  difficultyLabel: string;
  difficultyStars: number;
  entryTicketCost: number;
};

function raidEncounterForPhase(raid: RaidJson, phase: number) {
  const p = Math.max(1, Math.floor(phase));
  return (
    raid.encounters.find((e) => e.phase === p) ??
    raid.encounters.find((e) => String(e.category).toUpperCase() === "BOSS") ??
    raid.encounters[raid.encounters.length - 1]!
  );
}

function buildRaidCatalogEntry(raid: RaidJson): RaidCatalogEntry {
  const enc = raidEncounterForPhase(raid, 1);
  const monster = monstersJson[enc.monsterId.trim().toLowerCase() as keyof typeof monstersJson];
  const isBoss = String(enc?.category ?? "").toUpperCase() === "BOSS";
  const enemyPower = monster ? combatPowerFromMonster(monster) : 0;
  const powerForDiff = Math.floor(enemyPower * raidModeStatMult(raid.difficulty));
  const diff = raidDifficultyMeta(
    raid.id,
    powerForDiff,
    isBoss,
    raid.maxPartySize ?? 3,
    raid.difficulty,
  );
  return {
    id: raid.id,
    name: raid.name,
    maxPhases: raid.maxPhases,
    maxPartySize: raid.maxPartySize ?? 3,
    faction: raid.faction as RaidFaction,
    difficulty: raid.difficulty as RaidDifficultyMode,
    isBoss,
    enemyPower,
    recommendedPartyPower: diff.recommendedPartyPower,
    minPartyPower: minimumPartyPowerForRaid(diff.recommendedPartyPower),
    recommendedPerMinion: diff.recommendedPerMinion,
    difficultyLabel: diff.label,
    difficultyStars: diff.stars,
    entryTicketCost: raidEntryTicketCost(raid.difficulty),
  };
}

export const RAIDS_CATALOG: RaidCatalogEntry[] = raidsJson.map(buildRaidCatalogEntry);

export function raidsCatalog(): RaidCatalogEntry[] {
  return RAIDS_CATALOG;
}

export function raidCatalogForId(raidId: string): RaidCatalogEntry | null {
  return RAIDS_CATALOG.find((r) => r.id === raidId) ?? null;
}
