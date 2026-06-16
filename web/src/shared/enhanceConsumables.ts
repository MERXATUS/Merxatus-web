/** 강화 실패 시 골드·마석을 돌려주는 보호 주문서 (1장은 항상 소모) */
export const ITEM_ENHANCE_SCROLL_PROTECT = "item_enhance_scroll_protect";

/** 강화 성공 시 +2, 성공률 감소 */
export const ITEM_GEM_BLESSING = "item_gem_blessing";

/** 축복의 보석 — 성공 확률 감소 (퍼센트 포인트) */
export const BLESSING_GEM_SUCCESS_RATE_PENALTY = 18;

/** 축복의 보석 — 성공 시 추가 강화 단계 */
export const BLESSING_GEM_SUCCESS_LEVEL_GAIN = 2;

export function isEnhanceProtectScrollItemId(itemId: string): boolean {
  return itemId.trim().toLowerCase() === ITEM_ENHANCE_SCROLL_PROTECT;
}

export function isBlessingGemItemId(itemId: string): boolean {
  return itemId.trim().toLowerCase() === ITEM_GEM_BLESSING;
}

export function enhanceProtectScrollLabel(): string {
  return "강화 보호 주문서";
}

export function blessingGemLabel(): string {
  return "축복의 보석";
}

/** 대장간 제련 재료 칸 — 인벤에 없거나 DB 이름이 id인 경우 표시용 */
export function forgeEnhanceMaterialLabel(itemId: string): string {
  const id = itemId.trim().toLowerCase();
  if (isEnhanceProtectScrollItemId(id)) return enhanceProtectScrollLabel();
  if (isBlessingGemItemId(id)) return blessingGemLabel();
  return itemId;
}
