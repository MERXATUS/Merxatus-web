import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { PotionEffectDef } from "@/shared/potionEffects";

const PotionEffectSchema = z.object({
  name: z.string().min(1),
  grade: z.number().int().min(1),
  effectType: z.enum(["HP_Recovery"]),
  effectValue: z.string().min(1),
});

function resolveDataDir() {
  const cwd = process.cwd();
  const candidates = [path.join(cwd, "data"), path.join(cwd, "web", "data")];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "potion_effects.json"))) return dir;
  }
  return path.join(cwd, "data");
}

let cached: Map<string, PotionEffectDef> | null = null;

export async function loadPotionEffects(): Promise<Map<string, PotionEffectDef>> {
  if (cached) return cached;
  const dir = resolveDataDir();
  const p = path.join(dir, "potion_effects.json");
  if (!existsSync(p)) throw new Error(`POTION_EFFECTS_NOT_FOUND: ${p}`);
  const raw = JSON.parse(await readFile(p, "utf8")) as unknown;
  const parsed = z.record(z.string(), PotionEffectSchema).parse(raw);
  cached = new Map(Object.entries(parsed));
  return cached;
}

export async function getPotionEffect(itemId: string): Promise<PotionEffectDef | null> {
  const map = await loadPotionEffects();
  return map.get(itemId) ?? null;
}

export async function listHpRecoveryPotionIds(): Promise<string[]> {
  const map = await loadPotionEffects();
  return [...map.entries()]
    .filter(([, def]) => def.effectType === "HP_Recovery")
    .map(([id]) => id);
}
