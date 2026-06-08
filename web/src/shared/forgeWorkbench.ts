import {
  ITEM_APPRAISAL_SCROLL,
  ITEM_GEM_CHAOS,
  ITEM_GEM_DESTRUCTION,
  ITEM_GEM_SEAL,
  optionConsumableLabel,
  type OptionConsumableKind,
} from "@/shared/optionConsumables";
import { ITEM_ENHANCE_SCROLL_PROTECT, enhanceProtectScrollLabel } from "@/shared/enhanceConsumables";

/** 강화소 재료 표시 (강화 탭) — 하·중·상급 마석 + 보호석(선택) */
export const FORGE_ENHANCE_MATERIAL_IDS = [
  "item_lesser_mana_stone",
  "item_mana_stone",
  "item_greater_mana_stone",
  ITEM_ENHANCE_SCROLL_PROTECT,
] as const;

export type ForgeWorkbenchMode = "enhance" | "craft" | "salvage";

export type ForgeToolCategory = "option" | "craft";

/** 장비 가공·향후 크래프팅 도구 — items.json에 추가 후 여기에 등록 */
export type ForgeToolDef = {
  itemId: string;
  kind: OptionConsumableKind | "craft";
  label: string;
  shortLabel: string;
  description: string;
  hint: string;
  category: ForgeToolCategory;
  glyph: string;
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
];

export const FORGE_CRAFT_TOOLS: ForgeToolDef[] = [];

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
    description: "강화 시 함께 사용하면 실패해도 골드·마석이 반환됩니다. 보호서 1장은 소모됩니다.",
    hint: "강화 탭에서 체크 후 강화",
    category: "craft",
    glyph: "🛡",
  };
}
