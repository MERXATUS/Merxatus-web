import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const ItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  tradable: z.boolean().default(true),
  /** 1=일반 … 8=초월. 생략 시 시드가 `defaultItemGradeForItemId`로 채움 */
  grade: z.number().int().min(1).max(8).optional(),
  icon: z.string().min(1).optional(),
});

const DropSchema = z.object({
  itemId: z.string().min(1),
  weight: z.number().int().nonnegative(),
  minQty: z.number().int().positive(),
  maxQty: z.number().int().positive(),
  minTier: z.number().int().min(1).max(5).optional().default(1),
});

const WorkshopSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  drops: z.array(DropSchema).min(1),
});

const RecipeIOSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().positive(),
});

const RecipeOutputSchema = z.object({
  itemId: z.string().min(1),
  weight: z.number().int().nonnegative().optional(),
  minQty: z.number().int().positive().default(1),
  maxQty: z.number().int().positive().default(1),
});

const RecipeSchema = z.object({
  workshopName: z.string().min(1),
  name: z.string().min(1),
  inputs: z.array(RecipeIOSchema).min(1),
  outputs: z.array(RecipeOutputSchema).optional().default([]),
  rewardGold: z.number().int().nonnegative().optional().default(0),
  minTier: z.number().int().min(1).max(5).optional(),
  craftTimeSeconds: z.number().int().min(1).max(86400).optional(),
});

export type SeedItem = z.infer<typeof ItemSchema>;
export type SeedWorkshop = z.infer<typeof WorkshopSchema>;
export type SeedRecipe = z.infer<typeof RecipeSchema>;

async function loadJsonFile<T>(absPath: string): Promise<T> {
  const raw = await readFile(absPath, "utf8");
  return JSON.parse(raw) as T;
}

/** Next가 `web/` 또는 모노레포 루트에서 뜰 수 있어 `data/*.json` 위치를 둘 다 시도 */
function resolveDataDir() {
  const cwd = process.cwd();
  const candidates = [path.join(cwd, "data"), path.join(cwd, "web", "data")];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "items.json")) && existsSync(path.join(dir, "workshops.json"))) {
      return dir;
    }
  }
  return path.join(cwd, "data");
}

export async function loadSeedData() {
  const dataDir = resolveDataDir();
  const itemsPath = path.join(dataDir, "items.json");
  const workshopsPath = path.join(dataDir, "workshops.json");
  const recipesPath = path.join(dataDir, "recipes.json");

  if (!existsSync(itemsPath) || !existsSync(workshopsPath) || !existsSync(recipesPath)) {
    throw new Error(
      `SEED_DATA_NOT_FOUND: items.json / workshops.json / recipes.json 을 찾지 못했어. cwd=${process.cwd()} dataDir=${dataDir}`,
    );
  }

  const itemsRaw = await loadJsonFile<unknown>(itemsPath);
  const workshopsRaw = await loadJsonFile<unknown>(workshopsPath);
  const recipesRaw = await loadJsonFile<unknown>(recipesPath);

  const items = z.array(ItemSchema).parse(itemsRaw);
  const workshops = z.array(WorkshopSchema).parse(workshopsRaw);
  const recipes = z.array(RecipeSchema).parse(recipesRaw);

  return { items, workshops, recipes };
}

