/** 장비 옵션 소모품 itemId */
export const ITEM_APPRAISAL_SCROLL = "item_appraisal_scroll";
export const ITEM_GEM_DESTRUCTION = "item_gem_destruction";
export const ITEM_GEM_CHAOS = "item_gem_chaos";
export const ITEM_GEM_SEAL = "item_gem_seal";
export const ITEM_TOME_CELESTIAL = "item_tome_celestial";
export const ITEM_TOME_ABYSS = "item_tome_abyss";
export const ITEM_GEM_ASCENSION = "item_gem_ascension";
export const ITEM_GEM_PRIMORDIAL = "item_gem_primordial";
export const ITEM_GEM_VOID = "item_gem_void";
export const ITEM_GEM_TRANSFER = "item_gem_transfer";
export const ITEM_GEM_EXPANSION = "item_gem_expansion";
export const ITEM_GEM_METAMORPH = "item_gem_metamorph";
export const ITEM_GEM_METAMORPH_3 = "item_gem_metamorph_3";
export const ITEM_GEM_METAMORPH_6 = "item_gem_metamorph_6";
export const ITEM_GEM_METAMORPH_8 = "item_gem_metamorph_8";

export type OptionConsumableKind =
  | "appraisal"
  | "destruction"
  | "chaos"
  | "seal"
  | "celestial_tome"
  | "abyss_tome"
  | "ascension"
  | "primordial"
  | "void_reroll"
  | "transfer"
  | "expansion"
  | "metamorph"
  | "metamorph_3"
  | "metamorph_6"
  | "metamorph_8";

const BY_ITEM_ID: Record<string, OptionConsumableKind> = {
  [ITEM_APPRAISAL_SCROLL]: "appraisal",
  [ITEM_GEM_DESTRUCTION]: "destruction",
  [ITEM_GEM_CHAOS]: "chaos",
  [ITEM_GEM_SEAL]: "seal",
  [ITEM_TOME_CELESTIAL]: "celestial_tome",
  [ITEM_TOME_ABYSS]: "abyss_tome",
  [ITEM_GEM_ASCENSION]: "ascension",
  [ITEM_GEM_PRIMORDIAL]: "primordial",
  [ITEM_GEM_VOID]: "void_reroll",
  [ITEM_GEM_TRANSFER]: "transfer",
  [ITEM_GEM_EXPANSION]: "expansion",
  [ITEM_GEM_METAMORPH]: "metamorph",
  [ITEM_GEM_METAMORPH_3]: "metamorph_3",
  [ITEM_GEM_METAMORPH_6]: "metamorph_6",
  [ITEM_GEM_METAMORPH_8]: "metamorph_8",
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
    case "celestial_tome":
      return "천계의 서";
    case "abyss_tome":
      return "마계의 서";
    case "ascension":
      return "승천의 보석";
    case "primordial":
      return "태초의 보석";
    case "void_reroll":
      return "공허의 보석";
    case "transfer":
      return "전이의 보석";
    case "expansion":
      return "확장의 보석";
    case "metamorph":
      return "변형의 보석";
    case "metamorph_3":
      return "변형의 보석·III";
    case "metamorph_6":
      return "심변형의 보석";
    case "metamorph_8":
      return "극변형의 보석";
  }
}

export function metamorphMinTierForKind(kind: OptionConsumableKind): number | null {
  switch (kind) {
    case "metamorph":
      return null;
    case "metamorph_3":
      return 3;
    case "metamorph_6":
      return 6;
    case "metamorph_8":
      return 8;
    default:
      return null;
  }
}
