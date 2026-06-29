import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { applyCraftingDropsToDungeon } from "@/server/applyCraftingDrops";
import { DungeonSchema, type DungeonDef, loadDungeons } from "@/server/dungeonData";

const SpecialDungeonSchema = DungeonSchema.extend({
  linkedStageOrder: z.number().int().min(1).max(8),
  ticketItemId: z.string().min(1).optional(),
  ticketCost: z.number().int().positive().optional(),
});

export type SpecialDungeonDef = z.infer<typeof SpecialDungeonSchema>;

function resolveDataDir() {
  const cwd = process.cwd();
  const candidates = [path.join(cwd, "data"), path.join(cwd, "web", "data")];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "special_dungeons.json"))) return dir;
  }
  return path.join(cwd, "data");
}

let specialCache: { dungeons: SpecialDungeonDef[] } | null = null;

export async function loadSpecialDungeons() {
  if (specialCache) return specialCache;
  const p = path.join(resolveDataDir(), "special_dungeons.json");
  if (!existsSync(p)) {
    specialCache = { dungeons: [] };
    return specialCache;
  }
  const raw = JSON.parse(await readFile(p, "utf8")) as unknown;
  const parsed = z.array(SpecialDungeonSchema).parse(raw);
  const dungeons = parsed.map((d) => applyCraftingDropsToDungeon(d) as SpecialDungeonDef);
  specialCache = { dungeons };
  return specialCache;
}

export function isSpecialDungeonDef(d: DungeonDef): d is SpecialDungeonDef {
  return "linkedStageOrder" in d && typeof (d as SpecialDungeonDef).linkedStageOrder === "number";
}

export async function findDungeonById(dungeonId: string): Promise<DungeonDef | SpecialDungeonDef | null> {
  const id = dungeonId.trim();
  const { dungeons } = await loadDungeons();
  const main = dungeons.find((d) => d.id === id);
  if (main) return main;
  const { dungeons: special } = await loadSpecialDungeons();
  return special.find((d) => d.id === id) ?? null;
}

export async function findPushLuckDungeonById(dungeonId: string): Promise<SpecialDungeonDef | null> {
  const { dungeons } = await loadSpecialDungeons();
  const d = dungeons.find((x) => x.id === dungeonId);
  if (!d || d.mode !== "PUSH_LUCK") return null;
  return d;
}
