import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { applyCraftingDropsToRaid } from "@/server/applyCraftingDrops";
import { normalizeRaidFaction } from "@/shared/raidFaction";
import type { RaidDifficultyMode } from "@/shared/raidRoster";

const DropSchema = z.object({
  itemId: z.string().min(1),
  weight: z.number().int().nonnegative(),
  minQty: z.number().int().positive(),
  maxQty: z.number().int().positive(),
});

const EncounterSchema = z.object({
  monsterId: z.string().min(1),
  category: z.string().min(1),
  phase: z.number().int().min(1),
});

const RaidSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  maxPhases: z.number().int().min(1).max(12),
  maxPartySize: z.number().int().min(1).max(10).default(1),
  faction: z.enum(["demon", "angel"]),
  difficulty: z.enum(["normal", "hard"]).default("normal"),
  encounters: z.array(EncounterSchema).min(1),
  drops: z.array(DropSchema).min(1),
  phaseDrops: z.array(DropSchema).optional().default([]),
});

export type RaidDef = z.infer<typeof RaidSchema>;

function resolveDataDir() {
  const cwd = process.cwd();
  const candidates = [path.join(cwd, "data"), path.join(cwd, "web", "data")];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "raids.json"))) return dir;
  }
  return path.join(cwd, "data");
}

let raidsCache: { raids: RaidDef[] } | null = null;

export async function loadRaids() {
  if (raidsCache) return raidsCache;
  const p = path.join(resolveDataDir(), "raids.json");
  const raw = JSON.parse(await readFile(p, "utf8")) as unknown;
  const parsed = z.array(RaidSchema).parse(raw);
  const raids = parsed.map(applyCraftingDropsToRaid);
  raidsCache = { raids };
  return raidsCache;
}

export function raidEncounterForPhase(raid: RaidDef, phase: number) {
  const p = Math.max(1, Math.floor(phase));
  return (
    raid.encounters.find((e) => e.phase === p) ??
    raid.encounters.find((e) => e.category === "Boss") ??
    raid.encounters[raid.encounters.length - 1]!
  );
}
