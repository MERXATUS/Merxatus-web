/** 장비 옵션 소모품 itemId */
export const ITEM_APPRAISAL_SCROLL = "item_appraisal_scroll";
export const ITEM_GEM_DESTRUCTION = "item_gem_destruction";
export const ITEM_GEM_CHAOS = "item_gem_chaos";
export const ITEM_GEM_SEAL = "item_gem_seal";

export type OptionConsumableKind = "appraisal" | "destruction" | "chaos" | "seal";

const BY_ITEM_ID: Record<string, OptionConsumableKind> = {
  [ITEM_APPRAISAL_SCROLL]: "appraisal",
  [ITEM_GEM_DESTRUCTION]: "destruction",
  [ITEM_GEM_CHAOS]: "chaos",
  [ITEM_GEM_SEAL]: "seal",
};

export function optionConsumableKind(itemId: string): OptionConsumableKind | null {
  return BY_ITEM_ID[itemId.trim().toLowerCase()] ?? null;
}

export function isOptionConsumableItemId(itemId: string): boolean {
  return optionConsumableKind(itemId) != null;
}

export const OPTION_CONSUMABLE_ITEM_IDS = Object.keys(BY_ITEM_ID);

export function optionConsumableLabel(kind: OptionConsumableKind): string {
  switch (kind) {
    case "appraisal":
      return "감정 주문서";
    case "destruction":
      return "소멸의 보석";
    case "chaos":
      return "혼돈의 보석";
    case "seal":
      return "봉인의 보석";
  }
}
