export type ShopSubTab = "equipment_pull" | "materials" | "equipment";

export const SHOP_SUB_TAB_STORAGE_KEY = "merxatus_shop_sub_v1";
export const SHOP_SUB_TAB_EVENT = "shop_sub_tab";

export function shopSubTabFromStorage(raw: string | null): ShopSubTab | null {
  if (raw === "equipment_pull" || raw === "materials" || raw === "equipment") return raw;
  if (raw === "gacha") return "equipment_pull";
  return null;
}

export function writeStoredShopSubTab(sub: ShopSubTab) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SHOP_SUB_TAB_STORAGE_KEY, sub);
  } catch {
    /* ignore */
  }
}

export function readStoredShopSubTab(): ShopSubTab | null {
  if (typeof window === "undefined") return null;
  try {
    return shopSubTabFromStorage(sessionStorage.getItem(SHOP_SUB_TAB_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function notifyShopSubTab(sub: ShopSubTab) {
  writeStoredShopSubTab(sub);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SHOP_SUB_TAB_EVENT, { detail: sub }));
  }
}
