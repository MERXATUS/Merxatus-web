import { readItemsJson } from "@/server/adminData";
import { inferIconStemFromItemId, itemIconSrc } from "@/shared/itemIcon";

let iconByItemId: Map<string, string | undefined> | null = null;

async function loadIconByItemId(): Promise<Map<string, string | undefined>> {
  if (iconByItemId) return iconByItemId;
  const { data } = await readItemsJson();
  iconByItemId = new Map(data.map((it) => [it.id, it.icon]));
  return iconByItemId;
}

export function invalidateItemCatalogCache() {
  iconByItemId = null;
}

export async function itemIconFieldsForItemId(itemId: string): Promise<{ icon: string | null; iconSrc: string }> {
  const map = await loadIconByItemId();
  const icon = map.get(itemId) ?? inferIconStemFromItemId(itemId);
  return { icon, iconSrc: itemIconSrc({ itemId, icon }) };
}
