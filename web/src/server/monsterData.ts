import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const MonsterSchema = z.object({
  name: z.string().min(1),
  grade: z.number().int().positive(),
  hp: z.number().nonnegative(),
  atk: z.number().nonnegative(),
  magic: z.number().nonnegative(),
  as: z.number().nonnegative(),
  def: z.number().nonnegative(),
  /** `public/Monsters` PNG stem. 없으면 Icon_Monster_{Id} 규칙 + 글리프 폴백 */
  icon: z.string().min(1).optional(),
});

export type MonsterDef = z.infer<typeof MonsterSchema>;

let cached: Record<string, MonsterDef> | null = null;

function resolveDataDir() {
  const cwd = process.cwd();
  const candidates = [path.join(cwd, "data"), path.join(cwd, "web", "data")];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "monsters.json"))) return dir;
  }
  return path.join(cwd, "data");
}

export async function loadMonsters(): Promise<Record<string, MonsterDef>> {
  if (cached) return cached;
  const p = path.join(resolveDataDir(), "monsters.json");
  if (!existsSync(p)) throw new Error(`MONSTERS_DATA_NOT_FOUND: ${p}`);
  const raw = JSON.parse(await readFile(p, "utf8")) as unknown;
  const parsed = z.record(z.string(), MonsterSchema).parse(raw);
  cached = parsed;
  return parsed;
}

export function clearMonsterCache() {
  cached = null;
}

export async function getMonster(monsterId: string): Promise<MonsterDef> {
  const monsters = await loadMonsters();
  const m = monsters[monsterId.trim().toLowerCase()];
  if (!m) throw new Error(`MONSTER_NOT_FOUND:${monsterId}`);
  return m;
}
