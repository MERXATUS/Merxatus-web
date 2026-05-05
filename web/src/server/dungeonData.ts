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

const DungeonSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** AUTO_WAVES: 기존 틱 기반 자동 웨이브, PUSH_LUCK: 층을 직접 진행하며 누적보상/패배 소멸 */
  mode: z.enum(["AUTO_WAVES", "PUSH_LUCK"]).optional().default("AUTO_WAVES"),
  baseWaveSeconds: z.number().int().positive(),
  /** 난이도(승률 계산에 사용하는 power) */
  power: z.number().int().positive(),
  /** PUSH_LUCK: 최대 층 수 (기본 20) */
  maxFloors: z.number().int().min(1).max(200).optional().default(20),
  /** PUSH_LUCK: 층이 오를 때 power 증가 배수 (예: 1.12) */
  floorPowerGrowth: z.number().min(1.0).max(5).optional().default(1.12),
  drops: z.array(DungeonDropSchema).min(1),
  /** PUSH_LUCK: 보스 층(마지막 층) 전용 드랍(추가) */
  bossDrops: z.array(DungeonDropSchema).optional().default([]),
});

export type DungeonDef = z.infer<typeof DungeonSchema>;

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

