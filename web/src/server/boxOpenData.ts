import { readFile } from "node:fs/promises";
import path from "node:path";

export type BoxOpenDropRow = {
  itemId: string;
  weight: number;
  minQty: number;
  maxQty: number;
};

export type BoxOpensBundle = Record<string, BoxOpenDropRow[]>;

let cached: BoxOpensBundle | null = null;

function normalizeId(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_")
    .toLowerCase();
}

export async function loadBoxOpensBundle(): Promise<BoxOpensBundle> {
  if (cached) return cached;
  const file = path.join(process.cwd(), "data", "box_opens.json");
  const raw = await readFile(file, "utf8");
  const parsed = JSON.parse(raw) as BoxOpensBundle;
  cached = parsed;
  return parsed;
}

export function invalidateBoxOpensCache() {
  cached = null;
}

export async function boxOpenDropsForItem(boxItemId: string): Promise<BoxOpenDropRow[]> {
  const id = normalizeId(boxItemId);
  const bundle = await loadBoxOpensBundle();
  return bundle[id] ?? [];
}

export async function listOpenableBoxItemIds(): Promise<string[]> {
  const bundle = await loadBoxOpensBundle();
  return Object.keys(bundle).sort();
}
