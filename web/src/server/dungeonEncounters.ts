import type { DungeonDef } from "@/server/dungeonData";
import { getMonster, type MonsterDef } from "@/server/monsterData";

export type FloorMonster = {
  monsterId: string;
  monster: MonsterDef;
  category: "MONSTER" | "BOSS";
};

function normalizeCategory(raw: string): "MONSTER" | "BOSS" {
  return String(raw ?? "").trim().toUpperCase() === "BOSS" ? "BOSS" : "MONSTER";
}

export function pickEncounterForFloor(
  dungeon: Pick<DungeonDef, "encounters" | "maxFloors">,
  floor: number,
) {
  const maxFloors = dungeon.maxFloors ?? 20;
  const f = Math.max(1, Math.floor(floor));
  const encounters = dungeon.encounters ?? [];
  const matches = encounters.filter((e) => e.fromFloor <= f && f <= e.toFloor);
  if (matches.length === 0) return null;

  if (f >= maxFloors) {
    const boss = matches.find((e) => normalizeCategory(e.category) === "BOSS");
    if (boss) return boss;
  }

  const normal = matches.find((e) => normalizeCategory(e.category) === "MONSTER");
  return normal ?? matches[0]!;
}

export async function resolveFloorMonster(
  dungeon: Pick<DungeonDef, "id" | "encounters" | "maxFloors">,
  floor: number,
): Promise<FloorMonster> {
  const encounter = pickEncounterForFloor(dungeon, floor);
  if (!encounter) throw new Error(`NO_ENCOUNTER:${dungeon.id}:${floor}`);

  const monster = await getMonster(encounter.monsterId);
  return {
    monsterId: encounter.monsterId,
    monster,
    category: normalizeCategory(encounter.category),
  };
}
