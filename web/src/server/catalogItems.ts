import { readItemsJson } from "@/server/adminData";
import { normalizeItemIdLower } from "@/shared/itemId";

let catalogIdSet: Set<string> | null = null;
let catalogNameById: Map<string, string> | null = null;

/** `data/items.json` 기준 유효 아이템 id (무기·방어구·소모품 포함) */
export async function loadCatalogItemIdSet(): Promise<Set<string>> {
  if (catalogIdSet) return catalogIdSet;
  const { data } = await readItemsJson();
  catalogIdSet = new Set(data.map((it) => it.id.trim().toLowerCase()));
  return catalogIdSet;
}

/** `data/items.json` 기준 표시 이름 (DB Item.name 보정용) */
export async function loadCatalogItemNameMap(): Promise<Map<string, string>> {
  if (catalogNameById) return catalogNameById;
  const { data } = await readItemsJson();
  catalogNameById = new Map(data.map((it) => [it.id.trim().toLowerCase(), it.name]));
  return catalogNameById;
}

export function invalidateCatalogItemCache() {
  catalogIdSet = null;
  catalogNameById = null;
}

export function isCatalogItemId(itemId: unknown, catalog: Set<string>): boolean {
  const id = normalizeItemIdLower(itemId);
  return id.length > 0 && catalog.has(id);
}
