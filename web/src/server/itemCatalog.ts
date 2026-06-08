import { readItemsJson } from "@/server/adminData";
import { invalidateCatalogItemCache } from "@/server/catalogItems";
import { invalidateRoyalMaterialCache } from "@/server/royalPricing";
import { inferIconStemFromItemId, itemIconSrc } from "@/shared/itemIcon";
import { normalizeItemIdLower } from "@/shared/itemId";

let iconByItemId: Map<string, string | undefined> | null = null;

async function loadIconByItemId(): Promise<Map<string, string | undefined>> {
  if (iconByItemId) return iconByItemId;
  const { data } = await readItemsJson();
  iconByItemId = new Map(data.map((it) => [it.id, it.icon]));
  return iconByItemId;
}

export function invalidateItemCatalogCache() {
  iconByItemId = null;
  invalidateCatalogItemCache();
  invalidateRoyalMaterialCache();
}

export async function itemIconFieldsForItemId(itemId: string): Promise<{ icon: string | null; iconSrc: string }> {
  const map = await loadIconByItemId();
  return itemIconFieldsFromMap(itemId, map);
}

export async function getItemIconMap(): Promise<Map<string, string | undefined>> {
  return loadIconByItemId();
}

/** 아이콘 맵 1회 로드 후 동기 attach — N+1 await 제거 */
export function itemIconFieldsFromMap(
  itemId: unknown,
  map: Map<string, string | undefined>,
): { icon: string | null; iconSrc: string } {
  const id = normalizeItemIdLower(itemId);
  const icon = map.get(id) ?? inferIconStemFromItemId(id);
  return { icon, iconSrc: itemIconSrc({ itemId: id, icon }) };
}

export function attachIcons<T extends { itemId?: string; baseItemId?: string }>(
  rows: T[],
  map: Map<string, string | undefined>,
  idKey: "itemId" | "baseItemId" = "itemId",
): Array<T & { icon: string | null; iconSrc: string }> {
  return rows.map((row) => {
    const id = normalizeItemIdLower(idKey === "baseItemId" ? row.baseItemId : row.itemId);
    const { icon, iconSrc } = itemIconFieldsFromMap(id, map);
    return { ...row, icon, iconSrc };
  });
}
