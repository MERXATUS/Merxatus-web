import { readItemsJson } from "@/server/adminData";

let catalogIdSet: Set<string> | null = null;

/** `data/items.json` 기준 유효 아이템 id (무기·방어구·소모품 포함) */
export async function loadCatalogItemIdSet(): Promise<Set<string>> {
  if (catalogIdSet) return catalogIdSet;
  const { data } = await readItemsJson();
  catalogIdSet = new Set(data.map((it) => it.id.trim().toLowerCase()));
  return catalogIdSet;
}

export function invalidateCatalogItemCache() {
  catalogIdSet = null;
}

export function isCatalogItemId(itemId: string, catalog: Set<string>): boolean {
  return catalog.has(itemId.trim().toLowerCase());
}
