import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { normalizeMerxatusItemId, parseCsvRows } from "@/server/merxatusRoyalCsv";

const ItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  tradable: z.boolean().default(true),
  grade: z.number().int().min(1).max(8).optional(),
  /** `public/Items` 아래 PNG stem. 비우면 `id`와 동일한 파일명을 씀 */
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

function normalizeCategoryFromCsv(raw: string) {
  const s = String(raw ?? "").trim();
  const k = s.toLowerCase();
  if (k === "material" || k === "재료") return "재료";
  if (k === "potion" || k === "물약") return "물약";
  if (k === "minion_ticket" || k === "미니언고용권" || k === "ticket") {
    return "미니언고용권";
  }
  if (k === "weapon" || k === "무기") return "무기";
  if (k === "tool" || k === "도구") return "도구";
  return s || "재료";
}

function categoryForItemId(id: string, explicitCategoryRaw: string) {
  if (id.startsWith("weapon_")) return "무기";
  if (id.startsWith("tool_")) return "도구";
  const explicit = String(explicitCategoryRaw ?? "").trim();
  if (explicit) return normalizeCategoryFromCsv(explicit);
  return "재료";
}

function parseBoolFromCsv(raw: string) {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "y" || v === "yes";
}

function parseIntFromCsv(raw: string, def = 1) {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) ? n : def;
}

/** `data/csv-templates/items.csv` 행을 게임 아이템 형식으로 파싱 */
export async function readItemsCsvTemplate() {
  const p = dataPath("csv-templates", "items.csv");
  if (!existsSync(p)) {
    return { path: p, data: [] as z.infer<typeof ItemSchema>[] };
  }
  const raw = await readFile(p, "utf8");
  const rows = parseCsvRows(raw);
  const data = rows
    .map((row) => {
      const id = normalizeMerxatusItemId(row.Id ?? row.id ?? row.ItemId ?? row.itemId ?? "");
      if (!id) return null;
      const iconRaw = String(row.Icon ?? row.icon ?? "").trim();
      return {
        id,
        name: String(row.Name ?? row.name ?? id).trim() || id,
        category: categoryForItemId(id, row.Category ?? row.category ?? ""),
        tradable: parseBoolFromCsv(row.Tradable ?? row.tradable ?? "true"),
        grade: parseIntFromCsv(row.Grade ?? row.grade ?? "1", 1),
        ...(iconRaw ? { icon: iconRaw } : {}),
      };
    })
    .filter((x) => x !== null);
  return { path: p, data: z.array(ItemSchema).parse(data) };
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

