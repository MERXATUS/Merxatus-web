import {

  ITEM_APPRAISAL_SCROLL,

  ITEM_GEM_ASCENSION,

  ITEM_GEM_CHAOS,

  ITEM_GEM_DESTRUCTION,

  ITEM_GEM_EXPANSION,

  ITEM_GEM_METAMORPH,

  ITEM_GEM_METAMORPH_3,

  ITEM_GEM_METAMORPH_6,

  ITEM_GEM_METAMORPH_8,

  ITEM_GEM_PRIMORDIAL,

  ITEM_GEM_SEAL,

  ITEM_GEM_TRANSFER,

  ITEM_GEM_VOID,

  ITEM_TOME_ABYSS,

  ITEM_TOME_CELESTIAL,

  optionConsumableLabel,

  type OptionConsumableKind,

} from "@/shared/optionConsumables";

import { ITEM_ENHANCE_SCROLL_PROTECT, ITEM_GEM_BLESSING, enhanceProtectScrollLabel } from "@/shared/enhanceConsumables";
import {
  equipmentCraftConsumableLabel,
  ITEM_CRAFT_LEVEL_TIER1,
  ITEM_CRAFT_LEVEL_TIER2,
  ITEM_CRAFT_LEVEL_TIER3,
  ITEM_CRAFT_QUALITY_STONE,
  type EquipmentCraftConsumableKind,
} from "@/shared/equipmentCraftConsumables";
import { itemLevelTierLabel } from "@/shared/equipmentItemLevel";



/** 강화소 재료 표시 (강화 탭) — 하·중·상급 마석 + 보호 주문서·축복의 보석(선택) */

export const FORGE_ENHANCE_MATERIAL_IDS = [

  "item_lesser_mana_stone",

  "item_mana_stone",

  "item_greater_mana_stone",

  ITEM_ENHANCE_SCROLL_PROTECT,

  ITEM_GEM_BLESSING,

] as const;



export type ForgeWorkbenchMode = "enhance" | "craft" | "salvage";



export type ForgeToolCategory = "option" | "craft";



/** 장비 가공·향후 크래프팅 도구 — items.json에 추가 후 여기에 등록 */

export type ForgeToolDef = {

  itemId: string;

  kind: OptionConsumableKind | EquipmentCraftConsumableKind | "craft";

  label: string;

  shortLabel: string;

  description: string;

  hint: string;

  category: ForgeToolCategory;

  glyph: string;

  /** 전이의 보석처럼 두 번째 장비 선택이 필요할 때 */

  needsTransferTarget?: boolean;

  /** 레벨각인 — 대상 레벨 선택 UI */
  needsItemLevelPicker?: boolean;
};



export const FORGE_OPTION_TOOLS: ForgeToolDef[] = [

  {

    itemId: ITEM_APPRAISAL_SCROLL,

    kind: "appraisal",

    label: optionConsumableLabel("appraisal"),

    shortLabel: "감정",

    description: "미감정 무기·방어구의 옵션을 확인합니다.",

    hint: "미감정 장비에만 사용",

    category: "option",

    glyph: "◎",

  },

  {

    itemId: ITEM_GEM_DESTRUCTION,

    kind: "destruction",

    label: optionConsumableLabel("destruction"),

    shortLabel: "소멸",

    description: "감정된 장비에서 봉인되지 않은 옵션 1개를 무작위 제거합니다.",

    hint: "봉인(🔒) 슬롯은 제외",

    category: "option",

    glyph: "✕",

  },

  {

    itemId: ITEM_GEM_CHAOS,

    kind: "chaos",

    label: optionConsumableLabel("chaos"),

    shortLabel: "혼돈",

    description: "모든 옵션 종류를 변경합니다. 티어(T)는 유지됩니다.",

    hint: "봉인 슬롯은 변경되지 않음",

    category: "option",

    glyph: "⟳",

  },

  {

    itemId: ITEM_GEM_SEAL,

    kind: "seal",

    label: optionConsumableLabel("seal"),

    shortLabel: "봉인",

    description: "옵션 1개를 봉인합니다. 장비당 최대 1개.",

    hint: "소멸·혼돈의 영향을 받지 않음",

    category: "option",

    glyph: "🔒",

  },

  {

    itemId: ITEM_TOME_CELESTIAL,

    kind: "celestial_tome",

    label: optionConsumableLabel("celestial_tome"),

    shortLabel: "천계",

    description: "감정된 장비의 모든 옵션을 천계 옵션으로 바꿉니다. 티어(T)는 유지됩니다.",

    hint: "봉인 슬롯 포함 · 옵션 종류·접두 재추첨",

    category: "option",

    glyph: "☀",

  },

  {

    itemId: ITEM_TOME_ABYSS,

    kind: "abyss_tome",

    label: optionConsumableLabel("abyss_tome"),

    shortLabel: "마계",

    description: "감정된 장비의 모든 옵션을 마계 옵션으로 바꿉니다. 티어(T)는 유지됩니다.",

    hint: "봉인 슬롯 포함 · 옵션 종류·접미 재추첨",

    category: "option",

    glyph: "☾",

  },

  {

    itemId: ITEM_GEM_ASCENSION,

    kind: "ascension",

    label: optionConsumableLabel("ascension"),

    shortLabel: "승천",

    description: "감정된 장비의 옵션 중 1개 티어(T)를 1단계 올립니다.",

    hint: "등급별 티어 상한까지 · 봉인 슬롯 포함",

    category: "option",

    glyph: "↑",

  },

  {

    itemId: ITEM_GEM_PRIMORDIAL,

    kind: "primordial",

    label: optionConsumableLabel("primordial"),

    shortLabel: "태초",

    description: "장비의 모든 옵션과 봉인을 제거합니다.",

    hint: "미감정 장비에도 사용 가능",

    category: "option",

    glyph: "○",

  },

  {

    itemId: ITEM_GEM_VOID,

    kind: "void_reroll",

    label: optionConsumableLabel("void_reroll"),

    shortLabel: "공허",

    description: "옵션 1개를 천·마계에 없는 공허 특수 옵션으로 바꿉니다.",

    hint: "티어(T) 유지 · 스킬 피해 등 특수 효과",

    category: "option",

    glyph: "◌",

  },

  {

    itemId: ITEM_GEM_TRANSFER,

    kind: "transfer",

    label: optionConsumableLabel("transfer"),

    shortLabel: "전이",

    description: "원본 장비의 옵션·봉인을 같은 등급·부위의 다른 장비로 옮깁니다.",

    hint: "원본 선택 → 전이 대상 선택 · 원본은 옵션 없음",

    category: "option",

    glyph: "⇄",

    needsTransferTarget: true,

  },

  {

    itemId: ITEM_GEM_EXPANSION,

    kind: "expansion",

    label: optionConsumableLabel("expansion"),

    shortLabel: "확장",

    description: "빈 옵션 슬롯 1개를 등급별 최대치까지 무작위로 채웁니다.",

    hint: "등급별 슬롯 상한까지",

    category: "option",

    glyph: "+",

  },

  {

    itemId: ITEM_GEM_METAMORPH,

    kind: "metamorph",

    label: optionConsumableLabel("metamorph"),

    shortLabel: "변형",

    description: "모든 옵션 종류와 티어(T)를 다시 정합니다. 최소 티어 보장 없음.",

    hint: "봉인 슬롯 제외 · 혼돈+티어 재추첨",

    category: "option",

    glyph: "⟲T",

  },

  {

    itemId: ITEM_GEM_METAMORPH_3,

    kind: "metamorph_3",

    label: optionConsumableLabel("metamorph_3"),

    shortLabel: "변형III",

    description: "모든 옵션 종류와 티어(T)를 다시 정합니다. 각 옵션은 최소 T3입니다.",

    hint: "봉인 슬롯 제외 · 최소 T3",

    category: "option",

    glyph: "Ⅲ",

  },

  {

    itemId: ITEM_GEM_METAMORPH_6,

    kind: "metamorph_6",

    label: optionConsumableLabel("metamorph_6"),

    shortLabel: "심변형",

    description: "모든 옵션 종류와 티어(T)를 다시 정합니다. 각 옵션은 최소 T6입니다.",

    hint: "봉인 슬롯 제외 · 고급 장비용",

    category: "option",

    glyph: "Ⅵ",

  },

  {

    itemId: ITEM_GEM_METAMORPH_8,

    kind: "metamorph_8",

    label: optionConsumableLabel("metamorph_8"),

    shortLabel: "극변형",

    description: "모든 옵션 종류와 티어(T)를 다시 정합니다. 각 옵션은 최소 T8입니다.",

    hint: "봉인 슬롯 제외 · 최상급 장비용",

    category: "option",

    glyph: "Ⅷ",

  },

];



export const FORGE_CRAFT_TOOLS: ForgeToolDef[] = [
  {
    itemId: ITEM_CRAFT_QUALITY_STONE,
    kind: "quality_up",
    label: equipmentCraftConsumableLabel("quality_up"),
    shortLabel: "품질",
    description: "장비 품질을 1단계 올립니다. 장비당 최대 10회.",
    hint: "품질 0→10 · 연마제 10회 한도",
    category: "craft",
    glyph: "✦",
  },
  {
    itemId: ITEM_CRAFT_LEVEL_TIER1,
    kind: "level_tier1",
    label: equipmentCraftConsumableLabel("level_tier1"),
    shortLabel: "Lv각인Ⅰ",
    description: `아이템 레벨을 ${itemLevelTierLabel(1)} 구간으로 설정합니다.`,
    hint: "5레벨 단위 선택",
    category: "craft",
    glyph: "Ⅰ",
    needsItemLevelPicker: true,
  },
  {
    itemId: ITEM_CRAFT_LEVEL_TIER2,
    kind: "level_tier2",
    label: equipmentCraftConsumableLabel("level_tier2"),
    shortLabel: "Lv각인Ⅱ",
    description: `아이템 레벨을 ${itemLevelTierLabel(2)} 구간으로 설정합니다.`,
    hint: "5레벨 단위 선택",
    category: "craft",
    glyph: "Ⅱ",
    needsItemLevelPicker: true,
  },
  {
    itemId: ITEM_CRAFT_LEVEL_TIER3,
    kind: "level_tier3",
    label: equipmentCraftConsumableLabel("level_tier3"),
    shortLabel: "Lv각인Ⅲ",
    description: `아이템 레벨을 ${itemLevelTierLabel(3)} 구간으로 설정합니다.`,
    hint: "5레벨 단위 선택",
    category: "craft",
    glyph: "Ⅲ",
    needsItemLevelPicker: true,
  },
];



export function forgeToolsForMode(mode: ForgeWorkbenchMode): ForgeToolDef[] {

  if (mode === "enhance" || mode === "salvage") return [];

  return [...FORGE_OPTION_TOOLS, ...FORGE_CRAFT_TOOLS];

}



export function forgeMaterialIdsForMode(mode: ForgeWorkbenchMode): readonly string[] {

  if (mode === "craft") {

    return FORGE_OPTION_TOOLS.map((t) => t.itemId);

  }

  if (mode === "enhance") {

    return FORGE_ENHANCE_MATERIAL_IDS;

  }

  return [];

}



export function enhanceProtectScrollDef(): ForgeToolDef {

  return {

    itemId: ITEM_ENHANCE_SCROLL_PROTECT,

    kind: "craft",

    label: enhanceProtectScrollLabel(),

    shortLabel: "보호",

    description: "제련 시 함께 사용하면 실패해도 골드·마석이 반환됩니다. 보호서 1장은 소모됩니다.",

    hint: "제련 탭에서 체크 후 제련",

    category: "craft",

    glyph: "🛡",

  };

}



export function enhanceBlessingGemDef(): ForgeToolDef {

  return {

    itemId: ITEM_GEM_BLESSING,

    kind: "craft",

    label: "축복의 보석",

    shortLabel: "축복",

    description: "제련 성공 시 +2 상승. 대신 성공 확률이 크게 감소합니다.",

    hint: "제련 탭에서 체크 후 제련 · 보석 1개 소모",

    category: "craft",

    glyph: "✧",

  };

}


