import { existsSync } from "node:fs";

import { readFile } from "node:fs/promises";

import path from "node:path";

import { z } from "zod";
import { applyCraftingDropsToTower } from "@/server/applyCraftingDrops";



const DropSchema = z.object({
  itemId: z.string().min(1),
  weight: z.number().int().nonnegative(),
  minQty: z.number().int().positive(),
  maxQty: z.number().int().positive(),
  minFloor: z.number().int().min(1).optional(),
  maxFloor: z.number().int().min(1).optional(),
});



const EncounterSchema = z.object({

  monsterId: z.string().min(1),

  category: z.string().min(1),

  fromFloor: z.number().int().min(1),

  toFloor: z.number().int().min(1),

});



const TowerSchema = z.object({

  seasonKey: z.string().min(1),

  name: z.string().min(1),

  /** 80층 주기 등 — `encounters`가 있으면 층 번호를 이 값으로 순환 */

  encounterCycleFloors: z.number().int().min(1).optional(),

  encounters: z.array(EncounterSchema).optional().default([]),

  baseMonsterId: z.string().min(1).optional(),

  bossEveryFloors: z.number().int().min(1).default(10),

  bossMonsterId: z.string().min(1).optional(),

  drops: z.array(DropSchema).min(1),

  leaderboardBoardKey: z.string().min(1).default("tower"),

});



export type TowerDef = z.infer<typeof TowerSchema>;



function resolveDataDir() {

  const cwd = process.cwd();

  const candidates = [path.join(cwd, "data"), path.join(cwd, "web", "data")];

  for (const dir of candidates) {

    if (existsSync(path.join(dir, "tower.json"))) return dir;

  }

  return path.join(cwd, "data");

}



let towerConfigCache: TowerDef | null = null;



export async function loadTowerConfig() {

  if (towerConfigCache) return towerConfigCache;

  const p = path.join(resolveDataDir(), "tower.json");

  const raw = JSON.parse(await readFile(p, "utf8")) as unknown;

  towerConfigCache = applyCraftingDropsToTower(TowerSchema.parse(raw));

  return towerConfigCache;

}



function pickEncounterForFloor(encounters: TowerDef["encounters"], floorInCycle: number) {

  const f = Math.max(1, Math.floor(floorInCycle));

  const matches = encounters.filter((e) => e.fromFloor <= f && f <= e.toFloor);

  if (matches.length === 0) return null;

  const boss = matches.find((e) => String(e.category).toUpperCase() === "BOSS");

  if (boss && f === boss.toFloor) return { monsterId: boss.monsterId, category: "Boss" as const };

  const mon = matches.find((e) => String(e.category).toUpperCase() === "MONSTER") ?? matches[0]!;

  return {

    monsterId: mon.monsterId,

    category: String(mon.category).toUpperCase() === "BOSS" ? ("Boss" as const) : ("Monster" as const),

  };

}



export function towerMonsterForFloor(config: TowerDef, floor: number) {

  const f = Math.max(1, Math.floor(floor));

  if (config.encounters.length > 0) {

    const cycle = Math.max(1, config.encounterCycleFloors ?? 80);

    const fInCycle = ((f - 1) % cycle) + 1;

    const picked = pickEncounterForFloor(config.encounters, fInCycle);

    if (picked) return picked;

  }



  const bossEvery = Math.max(1, config.bossEveryFloors);

  if (f % bossEvery === 0 && config.bossMonsterId) {

    return { monsterId: config.bossMonsterId, category: "Boss" as const };

  }

  return {

    monsterId: config.baseMonsterId ?? "slime",

    category: "Monster" as const,

  };

}

