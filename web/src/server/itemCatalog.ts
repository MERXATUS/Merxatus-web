import { stat } from "node:fs/promises";
import path from "node:path";
import { readItemsJson } from "@/server/adminData";
import { invalidateCatalogItemCache } from "@/server/catalogItems";
import { invalidateRoyalMaterialCache } from "@/server/royalPricing";
import { inferIconStemFromItemId, itemIconSrc } from "@/shared/itemIcon";
import { normalizeItemIdLower } from "@/shared/itemId";

let iconByItemId: Map<string, string | undefined> | null = null;
let iconByItemIdSourceMtimeMs = -1;

function itemsJsonPath() {
  return path.join(process.cwd(), "data", "items.json");
}

async function shouldReloadIconByItemId(): Promise<boolean> {
  if (!iconByItemId) return true;
  if (process.env.NODE_ENV !== "development") return false;
  try {
    const mtimeMs = (await stat(itemsJsonPath())).mtimeMs;
    return mtimeMs !== iconByItemIdSourceMtimeMs;
  } catch {
    return false;
  }
}

async function loadIconByItemId(): Promise<Map<string, string | undefined>> {
  if (!(await shouldReloadIconByItemId())) return iconByItemId!;
  invalidateCatalogItemCache();
  const { data } = await readItemsJson();
  iconByItemId = new Map(data.map((it) => [it.id, it.icon]));
  if (process.env.NODE_ENV === "development") {
    try {
      iconByItemIdSourceMtimeMs = (await stat(itemsJsonPath())).mtimeMs;
    } catch {
      iconByItemIdSourceMtimeMs = -1;
    }
  }
  return iconByItemId;
}

export function invalidateItemCatalogCache() {
  iconByItemId = null;
  iconByItemIdSourceMtimeMs = -1;
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
