import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const ItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  tradable: z.boolean().default(true),
  grade: z.number().int().min(1).max(8).optional(),
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
  /** 시설 티어(1~5) 이상일 때만 제작 가능. 생략 시 이름 `(T2)` 패턴 또는 1 */
  minTier: z.number().int().min(1).max(5).optional(),
  /** 가공 시설: 1회 실행당 제작 시간(초). 미입력 시 60 */
  craftTimeSeconds: z.number().int().min(1).max(86400).optional(),
});

export type AdminItems = z.infer<typeof ItemSchema>[];
export type AdminWorkshops = z.infer<typeof WorkshopSchema>[];
export type AdminRecipes = z.infer<typeof RecipeSchema>[];

function dataPath(...parts: string[]) {
  return path.join(process.cwd(), "data", ...parts);
}

export async function readItemsJson() {
  const p = dataPath("items.json");
  const raw = await readFile(p, "utf8");
  const parsed = z.array(ItemSchema).parse(JSON.parse(raw));
  return { path: p, data: parsed };
}

export async function writeItemsJson(items: unknown) {
  const parsed = z.array(ItemSchema).parse(items);
  const p = dataPath("items.json");
  await writeFile(p, JSON.stringify(parsed, null, 2) + "\n", "utf8");
  return { path: p, data: parsed };
}

export async function readWorkshopsJson() {
  const p = dataPath("workshops.json");
  const raw = await readFile(p, "utf8");
  const parsed = z.array(WorkshopSchema).parse(JSON.parse(raw));
  return { path: p, data: parsed };
}

export async function writeWorkshopsJson(workshops: unknown) {
  const parsed = z.array(WorkshopSchema).parse(workshops);
  const p = dataPath("workshops.json");
  await writeFile(p, JSON.stringify(parsed, null, 2) + "\n", "utf8");
  return { path: p, data: parsed };
}

export async function readRecipesJson() {
  const p = dataPath("recipes.json");
  const raw = await readFile(p, "utf8");
  const parsed = z.array(RecipeSchema).parse(JSON.parse(raw));
  return { path: p, data: parsed };
}

export async function writeRecipesJson(recipes: unknown) {
  const parsed = z.array(RecipeSchema).parse(recipes);
  const p = dataPath("recipes.json");
  await writeFile(p, JSON.stringify(parsed, null, 2) + "\n", "utf8");
  return { path: p, data: parsed };
}

