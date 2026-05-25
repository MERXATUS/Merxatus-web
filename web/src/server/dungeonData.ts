import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const DungeonDropSchema = z.object({
  itemId: z.string().min(1),
  weight: z.number().int().nonnegative(),
  minQty: z.number().int().positive(),
  maxQty: z.number().int().positive(),
});

const DungeonEncounterSchema = z.object({
  monsterId: z.string().min(1),
  category: z.string().min(1),
  fromFloor: z.number().int().min(1),
  toFloor: z.number().int().min(1),
});

const DungeonSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** AUTO_WAVES: 기존 틱 기반 자동 웨이브, PUSH_LUCK: 층을 직접 진행하며 누적보상/패배 소멸 */
  mode: z.enum(["AUTO_WAVES", "PUSH_LUCK"]).optional().default("AUTO_WAVES"),
  baseWaveSeconds: z.number().int().positive(),
  /** PUSH_LUCK: 최대 층 수 (기본 20) */
  maxFloors: z.number().int().min(1).max(200).optional().default(20),
  /** 동시 파티 미니언 수 */
  maxPartySize: z.number().int().min(1).max(10).optional().default(1),
  /** 층별 등장 몬스터 — dungeon_drops.csv에서 생성 */
  encounters: z.array(DungeonEncounterSchema).min(1),
  drops: z.array(DungeonDropSchema).min(1),
  /** PUSH_LUCK: 보스 층(마지막 층) 전용 드랍(추가) */
  bossDrops: z.array(DungeonDropSchema).optional().default([]),
});

export type DungeonDef = z.infer<typeof DungeonSchema>;
export type DungeonEncounter = z.infer<typeof DungeonEncounterSchema>;

async function loadJsonFile<T>(absPath: string): Promise<T> {
  const raw = await readFile(absPath, "utf8");
  return JSON.parse(raw) as T;
}

function resolveDataDir() {
  const cwd = process.cwd();
  const candidates = [path.join(cwd, "data"), path.join(cwd, "web", "data")];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "dungeons.json"))) return dir;
  }
  return path.join(cwd, "data");
}

export async function loadDungeons() {
  const dir = resolveDataDir();
  const p = path.join(dir, "dungeons.json");
  if (!existsSync(p)) throw new Error(`DUNGEONS_DATA_NOT_FOUND: ${p}`);
  const raw = await loadJsonFile<unknown>(p);
  const dungeons = z.array(DungeonSchema).parse(raw);
  return { dungeons };
}
