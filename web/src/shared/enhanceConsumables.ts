/** 강화 실패 시 골드·마석을 돌려주는 보호석 (1장은 항상 소모) */
export const ITEM_ENHANCE_SCROLL_PROTECT = "item_enhance_scroll_protect";

export function isEnhanceProtectScrollItemId(itemId: string): boolean {
  return itemId.trim().toLowerCase() === ITEM_ENHANCE_SCROLL_PROTECT;
}

export function enhanceProtectScrollLabel(): string {
  return "강화 보호석";
}
